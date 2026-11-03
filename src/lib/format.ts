const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// "28 Oct 2026"
export function formatDate(iso: string) {
  return dateFormat.format(new Date(iso))
}
