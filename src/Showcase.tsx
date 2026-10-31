import { useState, type ReactNode } from 'react'
import { Button } from './components/Button'
import { Card } from './components/Card'
import { EmptyState } from './components/EmptyState'
import { Input } from './components/Input'
import { List, ListRow } from './components/ListRow'
import { PageContainer } from './components/PageContainer'
import { StatusBadge } from './components/StatusBadge'
import { Textarea } from './components/Textarea'
import { Toggle } from './components/Toggle'

// Design system check: one of each component. Not a product screen.
export function Showcase() {
  const [topic, setTopic] = useState('Why mid-market finance teams are dropping spreadsheets')
  const [email, setEmail] = useState('not-an-email')
  const [draft, setDraft] = useState(
    'Most finance teams we talk to still close the month in spreadsheets. Not because they love them, but because nothing else has earned their trust yet.',
  )
  const [includeDraft, setIncludeDraft] = useState(true)

  return (
    <PageContainer>
      <header className="flex flex-col gap-1">
        <h1 className="text-display font-semibold">distro design system</h1>
        <p className="text-body text-text-muted">One of each base component, built only from the tokens.</p>
      </header>

      <Section title="Type">
        <p className="text-display font-semibold">Display 32 semibold</p>
        <p className="text-title font-semibold">Title 20 semibold</p>
        <p className="text-body">
          Brief text, 16 at 1.6. It is read like a memo: one idea per paragraph, with enough room between lines that
          a marketer can scan the facts and still take in the draft.
        </p>
        <p className="text-small text-text-muted">Small 13, muted</p>
      </Section>

      <Section title="Colours">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {swatches.map(([name, bg]) => (
            <div key={name} className="flex items-center gap-1 text-small">
              <span className={`h-3 w-3 shrink-0 rounded-base border border-border ${bg}`} />
              {name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-1">
          <Button>Get brief</Button>
          <Button variant="secondary">Copy</Button>
          <Button variant="danger">Remove</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Input">
        <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error="Enter a valid email address."
        />
      </Section>

      <Section title="Textarea">
        <Textarea label="Draft" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={3000} />
        <Textarea label="Past post" value="" onChange={() => {}} maxLength={3000} rows={3} error="This post is empty." />
      </Section>

      <Section title="Toggle">
        <Toggle label="Include draft" checked={includeDraft} onChange={setIncludeDraft} />
      </Section>

      <Section title="Card">
        <Card>
          <p className="text-body">A Card: background, 1px border, 8px radius, no shadow.</p>
        </Card>
      </Section>

      <Section title="List row and status badge">
        <List>
          <ListRow
            title="Why mid-market finance teams are dropping spreadsheets"
            description="The hidden cost is not the software, it is the three days every month spent reconciling"
            meta="6 verified facts · 28 Oct 2026"
            trailing={<StatusBadge status="ready" />}
            onClick={() => {}}
          />
          <ListRow
            title="What a good onboarding call sounds like"
            description="Angle: shorter calls, more follow-up"
            meta="– · 30 Oct 2026"
            trailing={<StatusBadge status="queued" />}
            onClick={() => {}}
          />
          <ListRow
            title="Security reviews in the first 90 days"
            meta="– · 27 Oct 2026"
            trailing={<StatusBadge status="failed" />}
            onClick={() => {}}
          />
          <ListRow
            title="The real reason pilots stall"
            description="Angle: it is almost never the product"
            meta="5 verified facts · 20 Oct 2026"
            trailing={<StatusBadge status="posted" />}
            onClick={() => {}}
          />
        </List>
      </Section>

      <Section title="Empty state">
        <EmptyState message="Send your first topic and distro will come back with a sourced brief." />
      </Section>
    </PageContainer>
  )
}

const swatches = [
  ['background', 'bg-background'],
  ['surface', 'bg-surface'],
  ['border', 'bg-border'],
  ['text', 'bg-text'],
  ['text-muted', 'bg-text-muted'],
  ['accent', 'bg-accent'],
  ['danger', 'bg-danger'],
  ['success', 'bg-success'],
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title font-semibold">{title}</h2>
      {children}
    </section>
  )
}
