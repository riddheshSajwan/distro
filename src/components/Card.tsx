import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-base border border-border bg-background p-2 sm:p-3', className)} {...props} />
}
