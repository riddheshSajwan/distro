import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '../lib/cn'
import { controlClasses, Field } from './Field'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export function Input({ label, error, id, className, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <Field id={inputId} label={label} error={error}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(controlClasses, error ? 'border-danger' : 'border-border', className)}
        {...props}
      />
    </Field>
  )
}
