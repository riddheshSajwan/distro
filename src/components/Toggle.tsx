import { useId } from 'react'
import { cn } from '../lib/cn'

type ToggleProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ label, checked, onChange, disabled }: ToggleProps) {
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-3 w-6 shrink-0 cursor-pointer rounded-base disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          checked ? 'bg-accent' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0 left-0 h-3 w-3 rounded-base border bg-background',
            checked ? 'translate-x-3 border-accent' : 'border-border',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-body text-text">
        {label}
      </label>
    </div>
  )
}
