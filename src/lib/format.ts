const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

// "28 Oct 2026", from a timestamp, in the reader's time zone.
export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso))
}

// "28 Oct 2026", from a date-only column like facts.published_on ("2026-10-28").
// Read as UTC so it never shifts by a day in the reader's time zone.
export function formatDay(day: string) {
  return dayFormat.format(new Date(`${day}T00:00:00Z`))
}
