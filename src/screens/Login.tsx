import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { PageContainer } from '../components/PageContainer'
import { TextLink } from '../components/TextLink'
import { supabase } from '../lib/supabase'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [sendError, setSendError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string>()

  if (session === undefined) return null
  // TODO(Voice screen): first login (no pages row) goes to /voice instead. RequireAuth will handle it.
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!emailPattern.test(address)) {
      setEmailError('Enter a valid email address.')
      return
    }

    setEmailError(undefined)
    setSendError(undefined)
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    setSending(false)

    if (error) {
      setSendError('The sign-in link could not be sent. Try again in a minute.')
      return
    }
    setSentTo(address)
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-1 pt-6">
        <h1 className="text-display font-semibold">distro</h1>
        <p className="text-body text-text-muted">
          Bring this week's LinkedIn topic. Get sourced facts and a first draft in your page's voice.
        </p>
      </div>

      {sentTo ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-body">
            Check your email for a sign-in link. We sent it to <span className="font-semibold">{sentTo}</span>.
          </p>
          <div>
            <TextLink onClick={() => setSentTo(undefined)}>Use a different email</TextLink>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
          />
          <Button type="submit" disabled={sending} fullWidth>
            {sending ? 'Sending...' : 'Send magic link'}
          </Button>
          {sendError && (
            <p className="text-small text-danger" role="alert">
              {sendError}
            </p>
          )}
        </form>
      )}
    </PageContainer>
  )
}
