import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { MODEL, requestPromptVersion } from '../_shared/config.ts'
import { writeAudit } from '../_shared/supabase.ts'

// A LinkedIn post is at most 3,000 characters (~750 tokens). Thinking is off, so this
// caps the reply itself; a reply cut off at the cap counts as a failed draft.
const MAX_TOKENS = 1500
const MAX_FACTS = 6

export type DraftRequest = {
  id: string
  user_id: string
  page_id: string
  topic: string
  angle: string | null
  include_draft: boolean
}

type Page = { page_name: string; voice_posts: string[]; house_rules: string[] }
type Fact = { fact_text: string; source_title: string | null }

// draft_v1. Changing this text means a new DRAFT_PROMPT_VERSION in _shared/config.ts.
function systemPrompt(page: Page) {
  const posts = page.voice_posts.length
    ? `Past posts from the page. Match their voice: tone, sentence length, structure, how they open and close, and whether they use emoji, hashtags or line breaks. Do not copy their content.\n\n${page.voice_posts
        .map((post, i) => `<post ${i + 1}>\n${post}\n</post ${i + 1}>`)
        .join('\n\n')}`
    : 'There are no past posts yet. Write in a clear, plain, professional voice: short paragraphs, no hype, no emoji, at most two hashtags.'

  const rules = page.house_rules.length
    ? `House rules. Follow every one of them:\n${page.house_rules.map((rule) => `- ${rule}`).join('\n')}`
    : ''

  return `You write first drafts of LinkedIn text posts for the company page "${page.page_name}". A marketer will edit your draft, get it approved and post it.

${posts}

${rules}

Write one post on the topic, from the angle when one is given, using only the facts provided:
- Use only these facts. Do not add any other statistic, number, date, study, quote or claim, even if you believe it is true.
- Keep every number exactly as it appears in the fact.
- Name the source in the text where it helps the reader trust a number ("according to ..."). Do not include links.
- You don't have to use every fact. Two or three strong ones usually make a better post.
- Keep it under 3,000 characters. When there are past posts, keep to about their length.

Reply with the post text only: no title, no preamble, no notes, no quotation marks around it.`.replace(/\n{3,}/g, '\n\n')
}

function userMessage(request: DraftRequest, facts: Fact[]) {
  const list = facts
    .map((fact, i) => `${i + 1}. ${fact.fact_text}${fact.source_title ? ` (Source: ${fact.source_title})` : ''}`)
    .join('\n')
  return `Topic: ${request.topic}${request.angle ? `\nAngle: ${request.angle}` : ''}\n\nFacts:\n${list}`
}

// Writes the draft from the request's verified facts and the page's current voice.
// Every call to Claude writes one api_audit_log row. Throws on any failure.
export async function writeDraft(admin: SupabaseClient, request: DraftRequest): Promise<string> {
  const [{ data: page, error: pageError }, { data: facts, error: factsError }] = await Promise.all([
    admin.from('pages').select('page_name, voice_posts, house_rules').eq('id', request.page_id).single(),
    admin
      .from('facts')
      .select('fact_text, source_title')
      .eq('request_id', request.id)
      .eq('verified', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(MAX_FACTS),
  ])
  if (pageError || !page) throw new Error(`Page not loaded: ${pageError?.message ?? 'missing'}`)
  if (factsError) throw new Error(`Facts not loaded: ${factsError.message}`)
  if (!facts?.length) throw new Error('No verified facts to write from')

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: 60_000, maxRetries: 1 })
  const started = Date.now()
  const audit = {
    user_id: request.user_id,
    request_id: request.id,
    function_name: 'generate-draft' as const,
    model: MODEL,
    prompt_version: requestPromptVersion(request.include_draft),
    web_searches: 0,
  }

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: systemPrompt(page as Page),
      messages: [{ role: 'user', content: userMessage(request, facts as Fact[]) }],
    })
  } catch (error) {
    await writeAudit(admin, {
      ...audit,
      input_tokens: null,
      output_tokens: null,
      status: 'error',
      error_message: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - started,
    })
    throw error
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
  const problem =
    response.stop_reason !== 'end_turn' ? `stopped: ${response.stop_reason}` : text ? null : 'empty reply'

  await writeAudit(admin, {
    ...audit,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    status: problem ? 'error' : 'success',
    error_message: problem,
    latency_ms: Date.now() - started,
  })

  if (problem) throw new Error(`Draft ${problem}`)
  return text
}
