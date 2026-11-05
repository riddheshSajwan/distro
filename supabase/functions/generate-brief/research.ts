import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { MODEL } from '../_shared/config.ts'
import type { Candidate } from '../_shared/sourceCheck.ts'
import { writeAudit } from '../_shared/supabase.ts'

const CANDIDATE_COUNT = 8
const MAX_SEARCHES = 5
// pause_turn continuations plus one nudge if the model forgets to submit.
const MAX_CALLS = 4

// brief_v1. Changing this text means a new BRIEF_PROMPT_VERSION in _shared/config.ts.
function systemPrompt(today: string) {
  return `You research facts for a marketer at a B2B company who is writing a LinkedIn post for their company page. The current date is ${today}.

Use web search (at most ${MAX_SEARCHES} searches) to find ${CANDIDATE_COUNT} candidate facts about the topic, and about the angle when one is given. Then call submit_facts once with all of them, strongest first.

Each fact must be:
- One specific, checkable claim a B2B audience would find useful: a statistic, a finding, a dated event or a named example.
- Taken from a single page you saw in the search results, ideally a primary source: original research, an official report, a government or industry body, or a reputable publication. Avoid social media, forums, PDFs and paywalled pages.
- Published in the last 18 months where possible.

For each fact give:
- fact_text: the fact in one plain sentence, in your own words.
- source_url: the exact URL of the page it comes from.
- source_title: that page's title.
- source_quote: one or two full sentences copied word for word from that page's text, which state the fact. Do not paraphrase, shorten, join separate passages or use ellipses. The quote is checked automatically against the live page and the fact is thrown away if it does not match exactly.
- published_on: the page's publication date as YYYY-MM-DD, or null if you don't know it.

Every number in fact_text must appear in source_quote written the same way (if the quote says 62%, write 62%, not "nearly two thirds"). Never invent a fact, URL or quote. If you find fewer than ${CANDIDATE_COUNT} good facts, submit the ones you have.`
}

const submitFactsTool = {
  name: 'submit_facts',
  description: `Submit the candidate facts you found, strongest first. Call this exactly once, at the end of your research, with up to ${CANDIDATE_COUNT} facts.`,
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['facts'],
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['fact_text', 'source_url', 'source_title', 'source_quote', 'published_on'],
          properties: {
            fact_text: { type: 'string' },
            source_url: { type: 'string' },
            source_title: { type: 'string' },
            source_quote: { type: 'string' },
            published_on: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      },
    },
  },
}

type ResearchInput = {
  admin: SupabaseClient
  userId: string
  requestId: string
  topic: string
  angle: string | null
  // requests.prompt_version for this request: "brief_v1+draft_v1", or "brief_v1" with the draft off.
  promptVersion: string
}

// Haiku with web search. Returns the model's candidates in its order. Every call to
// Claude writes one api_audit_log row; a failed call throws after its row is written.
export async function research({ admin, userId, requestId, topic, angle, promptVersion }: ResearchInput): Promise<Candidate[]> {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 110_000, maxRetries: 1 })
  const today = new Date().toISOString().slice(0, 10)
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: angle ? `Topic: ${topic}\nAngle: ${angle}` : `Topic: ${topic}` },
  ]

  for (let call = 0; call < MAX_CALLS; call++) {
    const started = Date.now()
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt(today),
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES }, submitFactsTool],
        tool_choice: { type: 'auto' },
        output_config: { effort: 'medium' },
      })
    } catch (error) {
      await writeAudit(admin, {
        user_id: userId,
        request_id: requestId,
        function_name: 'generate-brief',
        model: MODEL,
        prompt_version: promptVersion,
        input_tokens: null,
        output_tokens: null,
        web_searches: null,
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        latency_ms: Date.now() - started,
      })
      throw error
    }

    const submitted = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'submit_facts',
    )
    const problem = submitted ? null : response.stop_reason === 'pause_turn' || response.stop_reason === 'end_turn' ? null : `stopped: ${response.stop_reason}`

    await writeAudit(admin, {
      user_id: userId,
      request_id: requestId,
      function_name: 'generate-brief',
      model: MODEL,
      prompt_version: promptVersion,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      web_searches: response.usage.server_tool_use?.web_search_requests ?? 0,
      status: problem ? 'error' : 'success',
      error_message: problem,
      latency_ms: Date.now() - started,
    })

    if (submitted) return parseCandidates(submitted.input)
    if (problem) throw new Error(`Research ${problem}`)

    // pause_turn: send the paused turn back unchanged and the server carries on.
    // end_turn without submitting: ask once more for the tool call.
    messages.push({ role: 'assistant', content: response.content })
    if (response.stop_reason === 'end_turn') {
      messages.push({ role: 'user', content: 'Call submit_facts now with the facts you found.' })
    }
  }

  throw new Error('Research ended without submitting facts')
}

function parseCandidates(input: unknown): Candidate[] {
  const facts = (input as { facts?: unknown })?.facts
  if (!Array.isArray(facts)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  return facts
    .map((f) => ({
      fact_text: str(f?.fact_text),
      source_url: str(f?.source_url),
      source_title: str(f?.source_title),
      source_quote: str(f?.source_quote),
      published_on: str(f?.published_on) || null,
    }))
    .filter((f) => f.fact_text && /^https?:\/\//i.test(f.source_url))
    .slice(0, CANDIDATE_COUNT)
}
