import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent border-accent text-background',
  secondary: 'bg-background border-border text-text hover:bg-surface',
  danger: 'bg-danger border-danger text-background',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  fullWidth?: boolean
}

export function Button({ variant = 'primary', fullWidth, type = 'button', className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-base border px-2 py-1 text-body font-semibold',
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
