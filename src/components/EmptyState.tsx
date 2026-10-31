import type { ReactNode } from 'react'

type EmptyStateProps = {
  message: string
  action?: ReactNode
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-base bg-surface px-3 py-6 text-center">
      <p className="max-w-content text-body text-text-muted">{message}</p>
      {action}
    </div>
  )
}
