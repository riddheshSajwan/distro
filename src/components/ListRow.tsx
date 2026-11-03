import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

type ListRowProps = {
  title: string
  // One line, cut with an ellipsis.
  description?: string
  meta?: ReactNode
  trailing?: ReactNode
  href?: string
  onClick?: () => void
}

// Stack rows inside a <List>; it draws the outer border and the dividers.
export function ListRow({ title, description, meta, trailing, href, onClick }: ListRowProps) {
  const content = (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold text-text">{title}</span>
        {description && <span className="truncate text-small text-text-muted">{description}</span>}
        {meta && <span className="text-small text-text-muted">{meta}</span>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </>
  )
  const classes = cn(
    'flex w-full items-start gap-2 px-2 py-2 text-left',
    (href || onClick) &&
      'cursor-pointer hover:bg-surface focus-visible:bg-surface focus-visible:outline-none',
  )

  if (href) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {content}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    )
  }
  return <div className={classes}>{content}</div>
}

// Placeholder row with the same shape as a ListRow, shown while a list loads.
export function ListRowSkeleton() {
  return (
    <div className="flex w-full items-start gap-2 px-2 py-2" aria-hidden="true">
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-2 w-2/3 animate-pulse rounded-base bg-surface" />
        <div className="h-2 w-1/2 animate-pulse rounded-base bg-surface" />
        <div className="h-2 w-1/3 animate-pulse rounded-base bg-surface" />
      </div>
      <div className="h-3 w-6 shrink-0 animate-pulse rounded-base bg-surface" />
    </div>
  )
}

export function List({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-base border border-border bg-background">
      {children}
    </div>
  )
}
