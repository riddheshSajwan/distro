import { useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'
import { controlClasses, Field } from './Field'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string
  // Shows "used / max" under the box when set.
  maxLength?: number
}

export function Textarea({ label, error, id, maxLength, value, rows = 6, className, ...props }: TextareaProps) {
  const autoId = useId()
  const textareaId = id ?? autoId
  const length = typeof value === 'string' ? value.length : 0

  const counter =
    maxLength !== undefined ? (
      <span className={cn('shrink-0 tabular-nums', length > maxLength ? 'text-danger' : 'text-text-muted')}>
        {length.toLocaleString()} / {maxLength.toLocaleString()}
      </span>
    ) : undefined

  return (
    <Field id={textareaId} label={label} error={error} aside={counter}>
      <textarea
        id={textareaId}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        className={cn(controlClasses, 'resize-y', error ? 'border-danger' : 'border-border', className)}
        {...props}
      />
    </Field>
  )
}
