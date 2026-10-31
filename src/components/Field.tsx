import type { ReactNode } from 'react'

// Shared label, hint and error layout for Input and Textarea.
type FieldProps = {
  id: string
  label: string
  error?: string
  aside?: ReactNode
  children: ReactNode
}

export function Field({ id, label, error, aside, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small font-semibold text-text">
        {label}
      </label>
      {children}
      {(error || aside) && (
        <div className="flex items-start justify-between gap-2 text-small">
          {error ? (
            <p id={`${id}-error`} className="text-danger">
              {error}
            </p>
          ) : (
            <span />
          )}
          {aside}
        </div>
      )}
    </div>
  )
}

export const controlClasses =
  'w-full rounded-base border bg-background px-2 py-1 text-body text-text placeholder:text-text-muted ' +
  'focus:border-accent focus:outline-none disabled:bg-surface disabled:text-text-muted'
