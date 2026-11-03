import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { List, ListRow, ListRowSkeleton } from '../components/ListRow'
import { PageContainer } from '../components/PageContainer'
import { StatusBadge, type RequestStatus } from '../components/StatusBadge'
import { formatDate } from '../lib/format'
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

export function Requests() {
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
      {/* TODO(request box): the new request Card goes here, above the list. */}
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
            // TODO(Brief screen): tapping a row opens /requests/:id.
            <ListRow
              key={request.id}
              title={request.topic}
              description={request.angle?.trim() || undefined}
              meta={`${factsLabel(request)} · ${formatDate(request.created_at)}`}
              trailing={<StatusBadge status={request.status} />}
            />
          ))}
        </List>
      )}
    </PageContainer>
  )
}
