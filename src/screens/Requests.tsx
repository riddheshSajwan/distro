import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { usePage } from '../auth/pageContext'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Input } from '../components/Input'
import { List, ListRow, ListRowSkeleton } from '../components/ListRow'
import { PageContainer } from '../components/PageContainer'
import { StatusBadge, type RequestStatus } from '../components/StatusBadge'
import { Toggle } from '../components/Toggle'
import { logEvent } from '../lib/events'
import { formatDate } from '../lib/format'
import { startBrief } from '../lib/pipeline'
import { supabase } from '../lib/supabase'

type RequestRow = {
  id: string
  topic: string
  angle: string | null
  status: RequestStatus
  created_at: string
  verifiedCount: number
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; requests: RequestRow[] }

async function fetchRequests(): Promise<RequestRow[]> {
  // RLS limits this to the signed-in user's rows. facts(count) counts only the
  // embedded rows that pass the facts.verified filter.
  const { data, error } = await supabase
    .from('requests')
    .select('id, topic, angle, status, created_at, facts(count)')
    .eq('facts.verified', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data.map(({ facts, ...row }) => ({
    ...row,
    status: row.status as RequestStatus,
    verifiedCount: facts[0]?.count ?? 0,
  }))
}

function factsLabel({ status, verifiedCount }: RequestRow) {
  if (status === 'queued' || status === 'failed') return '– verified facts'
  return `${verifiedCount} verified ${verifiedCount === 1 ? 'fact' : 'facts'}`
}

function RequestBox() {
  const page = usePage()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [includeDraft, setIncludeDraft] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string>()

  const canSend = topic.trim().length > 0 && !sending

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSend || !page || !session) return

    setSending(true)
    setSendError(undefined)
    const trimmedAngle = angle.trim()

    // status and run_started_at are left to their column defaults ('queued' and the
    // database's now()), so the 5 minute timeout runs on the server's clock.
    const { data, error } = await supabase
      .from('requests')
      .insert({
        user_id: session.user.id,
        page_id: page.id,
        topic: topic.trim(),
        angle: trimmedAngle || null,
        include_draft: includeDraft,
      })
      .select('id')
      .single()

    if (error) {
      setSending(false)
      setSendError('Your topic could not be sent. Check your connection and try again.')
      return
    }

    await logEvent('request_created', {
      request_id: data.id,
      include_draft: includeDraft,
      has_angle: trimmedAngle.length > 0,
    })
    await startBrief(data.id)
    navigate(`/requests/${data.id}`)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
        <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <Input label="Angle (optional)" value={angle} onChange={(e) => setAngle(e.target.value)} />
        <Toggle label="Include draft" checked={includeDraft} onChange={setIncludeDraft} />
        <Button type="submit" disabled={!canSend} fullWidth>
          {sending ? 'Sending...' : 'Get brief'}
        </Button>
        {sendError && (
          <p className="text-small text-danger" role="alert">
            {sendError}
          </p>
        )}
      </form>
    </Card>
  )
}

export function Requests() {
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    fetchRequests().then(
      (requests) => current && setState({ kind: 'loaded', requests }),
      () => current && setState({ kind: 'error' }),
    )
    return () => {
      current = false
    }
  }, [attempt])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <PageContainer>
      <RequestBox />
      <h1 className="text-title font-semibold">Your requests</h1>

      {state.kind === 'loading' && (
        <List>
          <ListRowSkeleton />
          <ListRowSkeleton />
          <ListRowSkeleton />
        </List>
      )}

      {state.kind === 'error' && (
        <EmptyState
          message="Your requests could not be loaded. Check your connection and try again."
          action={
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          }
        />
      )}

      {state.kind === 'loaded' && state.requests.length === 0 && (
        <EmptyState message="Send your first topic and distro will come back with a sourced brief." />
      )}

      {state.kind === 'loaded' && state.requests.length > 0 && (
        <List>
          {state.requests.map((request) => (
            <ListRow
              key={request.id}
              title={request.topic}
              description={request.angle?.trim() || undefined}
              meta={`${factsLabel(request)} · ${formatDate(request.created_at)}`}
              trailing={<StatusBadge status={request.status} />}
              onClick={() => navigate(`/requests/${request.id}`)}
            />
          ))}
        </List>
      )}
    </PageContainer>
  )
}
