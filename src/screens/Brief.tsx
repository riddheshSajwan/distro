import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Input } from '../components/Input'
import { List, ListRowSkeleton } from '../components/ListRow'
import { PageContainer } from '../components/PageContainer'
import { StatusBadge, type RequestStatus } from '../components/StatusBadge'
import { Textarea } from '../components/Textarea'
import { TextLink } from '../components/TextLink'
import { Toggle } from '../components/Toggle'
import type { Tables } from '../lib/database.types'
import { logEvent } from '../lib/events'
import { formatDate, formatDay } from '../lib/format'
import { markDraftTimedOut, markTimedOut, retryBrief, retryDraft } from '../lib/pipeline'
import { supabase } from '../lib/supabase'

const POLL_MS = 3000
const AUTOSAVE_MS = 1000
const COPIED_MS = 2000
const MAX_FACTS = 6
// After this long in queued, ask the server to mark the request failed. The server re-checks the time.
const RUN_TIMEOUT_MS = 5 * 60 * 1000

type Request = Tables<'requests'>
type Fact = Pick<Tables<'facts'>, 'id' | 'fact_text' | 'source_url' | 'source_title' | 'published_on' | 'used'>

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'missing' }
  | { kind: 'loaded'; request: Request; facts: Fact[] }

async function fetchRequest(id: string) {
  const { data, error } = await supabase.from('requests').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// Only verified facts are ever shown, at most 6. There is no position column, so the
// model's order is the order the edge function inserts them in (created_at, then id).
async function fetchFacts(id: string): Promise<Fact[]> {
  const { data, error } = await supabase
    .from('facts')
    .select('id, fact_text, source_url, source_title, published_on, used')
    .eq('request_id', id)
    .eq('verified', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_FACTS)
  if (error) throw error
  return data
}

// Ready with the draft on, but generate-draft hasn't written a draft or an error yet.
function draftPending(request: Request) {
  return request.status === 'ready' && request.include_draft && !request.draft_text && !request.error_message
}

function saveFinalText(requestId: string, finalText: string) {
  return supabase.from('requests').update({ final_text: finalText }).eq('id', requestId)
}

export function Brief() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(async (): Promise<State> => {
    try {
      const [request, facts] = await Promise.all([fetchRequest(id), fetchFacts(id)])
      return request ? { kind: 'loaded', request, facts } : { kind: 'missing' }
    } catch {
      return { kind: 'error' }
    }
  }, [id])

  useEffect(() => {
    let current = true
    load().then((next) => current && setState(next))
    return () => {
      current = false
    }
  }, [load, attempt])

  // Poll every 3s while queued or while a draft is being written; stop once that changes.
  const request = state.kind === 'loaded' ? state.request : undefined
  const status = request?.status
  const polling = !!request && (request.status === 'queued' || draftPending(request))
  const hasFacts = state.kind === 'loaded' && state.facts.length > 0
  const runStartedAt = request?.run_started_at

  useEffect(() => {
    if (!polling) return
    let cancelled = false
    let timer: number | undefined

    const tick = async () => {
      try {
        const timedOut = !!runStartedAt && Date.now() - Date.parse(runStartedAt) >= RUN_TIMEOUT_MS
        if (timedOut && status === 'queued') await markTimedOut(id)
        else if (timedOut && status === 'ready') await markDraftTimedOut(id)
        const next = await fetchRequest(id)
        if (next && !cancelled) {
          const facts = next.status !== status || !hasFacts ? await fetchFacts(id) : undefined
          if (!cancelled) {
            setState((prev) =>
              prev.kind === 'loaded' ? { ...prev, request: next, facts: facts ?? prev.facts } : prev,
            )
          }
        }
      } catch {
        // A failed poll is retried on the next tick.
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
    }

    timer = window.setTimeout(tick, POLL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [polling, status, hasFacts, runStartedAt, id])

  // Re-read the row after a retry so the screen (and polling) follows the new status.
  const refresh = useCallback(async () => {
    const next = await load()
    if (next.kind === 'loaded') setState(next)
  }, [load])

  const setRequest = useCallback(
    (next: Request) => setState((prev) => (prev.kind === 'loaded' ? { ...prev, request: next } : prev)),
    [],
  )
  const setFact = useCallback(
    (next: Fact) =>
      setState((prev) =>
        prev.kind === 'loaded'
          ? { ...prev, facts: prev.facts.map((fact) => (fact.id === next.id ? next : fact)) }
          : prev,
      ),
    [],
  )

  if (state.kind === 'loading') {
    return (
      <PageContainer>
        <List>
          <ListRowSkeleton />
        </List>
      </PageContainer>
    )
  }

  if (state.kind === 'error') {
    return (
      <PageContainer>
        <EmptyState
          message="This brief could not be loaded. Check your connection and try again."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setState({ kind: 'loading' })
                setAttempt((n) => n + 1)
              }}
            >
              Retry
            </Button>
          }
        />
      </PageContainer>
    )
  }

  if (state.kind === 'missing') {
    return (
      <PageContainer>
        <EmptyState message="This request could not be found." action={<TextLink to="/">Back to requests</TextLink>} />
      </PageContainer>
    )
  }

  const { request: req, facts } = state
  const reqStatus = req.status as RequestStatus
  const isDone = reqStatus === 'ready' || reqStatus === 'posted'

  return (
    <PageContainer>
      <BriefHeader request={req} />

      {reqStatus === 'queued' && (
        <Card role="status">
          <p className="text-body">Researching your topic. This usually takes under two minutes.</p>
        </Card>
      )}

      {reqStatus === 'failed' && <FailedBrief request={req} onRetried={refresh} />}

      {isDone && (
        <>
          <FactsSection requestId={req.id} facts={facts} onChange={setFact} />
          {req.include_draft && <DraftSection request={req} onRetried={refresh} />}
          {reqStatus === 'ready' && <MarkPosted request={req} onPosted={setRequest} />}
          {reqStatus === 'posted' && <PostedNote request={req} />}
        </>
      )}
    </PageContainer>
  )
}

function BriefHeader({ request }: { request: Request }) {
  return (
    <div className="flex flex-col gap-1">
      <div>
        <TextLink tone="muted" to="/">
          Back to requests
        </TextLink>
      </div>
      <h1 className="text-title font-semibold wrap-break-word">{request.topic}</h1>
      {request.angle && <p className="text-body text-text-muted wrap-break-word">{request.angle}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge status={request.status as RequestStatus} />
        <span className="text-small text-text-muted">{formatDate(request.created_at)}</span>
      </div>
    </div>
  )
}

function FailedBrief({ request, onRetried }: { request: Request; onRetried: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [retryError, setRetryError] = useState<string>()

  async function handleRetry() {
    setBusy(true)
    setRetryError(undefined)
    try {
      await retryBrief(request.id)
    } catch {
      setRetryError('distro could not start again. Check your connection and try again.')
    }
    await onRetried()
    setBusy(false)
  }

  return (
    <Card className="flex flex-col gap-2" role="alert">
      <p className="text-body">{request.error_message ?? 'This brief could not be finished.'}</p>
      <div>
        <Button variant="secondary" onClick={handleRetry} disabled={busy}>
          Try again
        </Button>
      </div>
      {retryError && <p className="text-small text-danger">{retryError}</p>}
    </Card>
  )
}

function FactsSection({
  requestId,
  facts,
  onChange,
}: {
  requestId: string
  facts: Fact[]
  onChange: (fact: Fact) => void
}) {
  const count = facts.length

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-semibold">Facts</h2>
      {count >= 1 && count <= 4 && (
        <p className="text-body text-text-muted">
          Only {count} {count === 1 ? 'fact' : 'facts'} could be checked against their sources.
        </p>
      )}
      {facts.map((fact) => (
        <FactItem key={fact.id} requestId={requestId} fact={fact} onChange={onChange} />
      ))}
    </section>
  )
}

function sourceLabel(fact: Fact) {
  if (fact.source_title?.trim()) return fact.source_title
  try {
    return new URL(fact.source_url).hostname
  } catch {
    return fact.source_url
  }
}

function FactItem({ requestId, fact, onChange }: { requestId: string; fact: Fact; onChange: (fact: Fact) => void }) {
  const [saving, setSaving] = useState(false)

  async function handleUsed(used: boolean) {
    setSaving(true)
    onChange({ ...fact, used })
    const { error } = await supabase.from('facts').update({ used }).eq('id', fact.id)
    if (error) {
      onChange(fact)
    } else if (used) {
      // Unticking saves used = false and logs nothing.
      await logEvent('fact_marked_used', { request_id: requestId, fact_id: fact.id })
    }
    setSaving(false)
  }

  return (
    <Card className="flex flex-col gap-2">
      <p className="text-body">{fact.fact_text}</p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <TextLink href={fact.source_url} className="wrap-break-word">
            {sourceLabel(fact)}
          </TextLink>
          {fact.published_on && (
            <span className="text-small text-text-muted">Published {formatDay(fact.published_on)}</span>
          )}
        </div>
        <Toggle label="Used" checked={fact.used} onChange={handleUsed} disabled={saving} />
      </div>
    </Card>
  )
}

function DraftSection({ request, onRetried }: { request: Request; onRetried: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [retryError, setRetryError] = useState<string>()

  async function handleRetry() {
    setBusy(true)
    setRetryError(undefined)
    try {
      await retryDraft(request.id)
    } catch {
      setRetryError('distro could not start the draft again. Check your connection and try again.')
    }
    await onRetried()
    setBusy(false)
  }

  let body
  if (request.draft_text) {
    // Keyed on draft_text so a rewritten draft starts a fresh editor.
    body = <DraftEditor key={request.draft_text} request={request} readOnly={request.status === 'posted'} />
  } else if (request.error_message) {
    body = (
      <Card className="flex flex-col gap-2" role="alert">
        <p className="text-body">{request.error_message}</p>
        <div>
          <Button variant="secondary" onClick={handleRetry} disabled={busy}>
            Write draft again
          </Button>
        </div>
        {retryError && <p className="text-small text-danger">{retryError}</p>}
      </Card>
    )
  } else {
    body = (
      <Card role="status">
        <p className="text-body">Writing the draft...</p>
      </Card>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-semibold">Draft</h2>
      {body}
    </section>
  )
}

function DraftEditor({ request, readOnly }: { request: Request; readOnly: boolean }) {
  const requestId = request.id
  // The marketer's saved edits win over the original draft.
  const [text, setText] = useState(request.final_text ?? request.draft_text ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const pending = useRef<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const copiedTimer = useRef<number | undefined>(undefined)

  const save = useCallback(
    async (value: string) => {
      const { error } = await saveFinalText(requestId, value)
      setSaveState(error ? 'error' : 'saved')
    },
    [requestId],
  )

  // Leaving the screen inside the 1s window still saves the last edit.
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current)
      window.clearTimeout(copiedTimer.current)
      if (pending.current !== null) {
        saveFinalText(requestId, pending.current).then(() => {})
        pending.current = null
      }
    },
    [requestId],
  )

  function handleChange(value: string) {
    setText(value)
    setSaveState('idle')
    pending.current = value
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      pending.current = null
      void save(value)
    }, AUTOSAVE_MS)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setCopyState('error')
      return
    }
    // Copy saves right away, so any pending autosave is no longer needed.
    window.clearTimeout(saveTimer.current)
    pending.current = null
    setCopyState('copied')
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopyState('idle'), COPIED_MS)
    await Promise.all([save(text), logEvent('draft_copied', { request_id: requestId })])
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label="Draft"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        readOnly={readOnly}
        rows={12}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleCopy}>{copyState === 'copied' ? 'Copied' : 'Copy'}</Button>
        {copyState === 'error' && <span className="text-small text-danger">Could not copy. Select the text instead.</span>}
        {!readOnly && saveState === 'saved' && <span className="text-small text-text-muted">Saved</span>}
        {saveState === 'error' && <span className="text-small text-danger">Not saved. Keep typing to retry.</span>}
      </div>
    </div>
  )
}

function MarkPosted({ request, onPosted }: { request: Request; onPosted: (request: Request) => void }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  function cancel() {
    setOpen(false)
    setUrl('')
    setError(undefined)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    const value = url.trim()
    if (!value.toLowerCase().includes('linkedin.com')) {
      setError('Enter the link to your post on linkedin.com.')
      return
    }

    setSaving(true)
    setError(undefined)
    // Only a ready request can be marked as posted, and it can't be undone.
    const { data, error: saveError } = await supabase
      .from('requests')
      .update({ posted_url: value, posted_at: new Date().toISOString(), status: 'posted' })
      .eq('id', request.id)
      .eq('status', 'ready')
      .select('*')
      .maybeSingle()

    if (saveError || !data) {
      setSaving(false)
      setError('This could not be saved. Try again.')
      return
    }
    await logEvent('request_posted', { request_id: request.id })
    onPosted(data)
  }

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Mark as posted
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <form onSubmit={handleSave} noValidate className="flex flex-col gap-2">
        <Input
          label="LinkedIn post URL"
          type="url"
          inputMode="url"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={error}
        />
        <p className="text-small text-text-muted">Once saved, this can't be undone and the link can't be changed.</p>
        <div className="flex flex-wrap gap-1">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PostedNote({ request }: { request: Request }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-body">
        Posted{request.posted_at ? ` on ${formatDate(request.posted_at)}` : ''}.
      </p>
      {request.posted_url && (
        <div>
          <TextLink href={request.posted_url} className="wrap-break-word">
            View the post on LinkedIn
          </TextLink>
        </div>
      )}
    </Card>
  )
}
