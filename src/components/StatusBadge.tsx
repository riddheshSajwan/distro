import { cn } from '../lib/cn'

export type RequestStatus = 'queued' | 'ready' | 'failed' | 'posted'

const styles: Record<RequestStatus, string> = {
  queued: 'text-text-muted',
  ready: 'text-accent',
  failed: 'text-danger',
  posted: 'text-success',
}

const labels: Record<RequestStatus, string> = {
  queued: 'Queued',
  ready: 'Ready',
  failed: 'Failed',
  posted: 'Posted',
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-base border border-current bg-background px-1 text-small font-semibold whitespace-nowrap',
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  )
}
