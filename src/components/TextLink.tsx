import type { MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../lib/cn'

type Tone = 'accent' | 'muted'

const tones: Record<Tone, string> = {
  accent: 'text-accent hover:underline',
  muted: 'text-text-muted hover:text-text',
}

type TextLinkProps = {
  children: ReactNode
  tone?: Tone
  className?: string
  // Renders a router link when `to` is set, an external link that opens in a new tab
  // when `href` is set, otherwise a button that looks like a link.
  to?: string
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
}

export function TextLink({ children, tone = 'accent', className, to, href, onClick }: TextLinkProps) {
  const classes = cn(
    'cursor-pointer rounded-base text-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    tones[tone],
    className,
  )

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={classes}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {children}
    </button>
  )
}
