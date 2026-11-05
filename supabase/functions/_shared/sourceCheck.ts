// The source check from CLAUDE.md. Plain code, never the model.
//
// Fetch the page (10s timeout), strip the HTML, lowercase, collapse whitespace.
// Keep a fact only if its source_quote is on the page and every number in the
// fact is in the quote. Then date it: the page's date if it has one, otherwise
// the model's; drop it if that date is more than 18 months old. Anything that
// goes wrong (paywall, JavaScript-only page, timeout, error) fails the fact.

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 3_000_000
const MAX_AGE_MONTHS = 18
// A quote this short could match almost any page, so it proves nothing.
const MIN_QUOTE_WORDS = 5

export type Candidate = {
  fact_text: string
  source_url: string
  source_title: string
  source_quote: string
  published_on: string | null
}

export type CheckResult = {
  passed: boolean
  published_on: string | null
  reason: string
}

export async function checkSource(fact: Candidate, now = new Date()): Promise<CheckResult> {
  const modelDate = toDay(fact.published_on)
  const fail = (reason: string, published_on = modelDate): CheckResult => ({ passed: false, published_on, reason })

  const quote = normalize(decodeEntities(fact.source_quote))
  if (quote.split(' ').length < MIN_QUOTE_WORDS) return fail('quote too short')

  const quoteNumbers = new Set(numbersIn(quote))
  const missing = numbersIn(fact.fact_text).filter((n) => !quoteNumbers.has(n))
  if (missing.length) return fail(`numbers not in quote: ${missing.join(', ')}`)

  let html: string
  try {
    html = await fetchPage(fact.source_url)
  } catch (error) {
    return fail(`fetch failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!normalize(htmlToText(html)).includes(quote)) return fail('quote not on page')

  const published_on = pageDate(html, now) ?? modelDate
  if (published_on && isOlderThan(published_on, MAX_AGE_MONTHS, now)) {
    return fail(`older than ${MAX_AGE_MONTHS} months`, published_on)
  }

  return { passed: true, published_on, reason: 'ok' }
}

// ---------------------------------------------------------------------------
// Fetching

async function fetchPage(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('not http(s)')
  if (isPrivateHost(parsed.hostname)) throw new Error('private host')

  // The signal covers the whole exchange, including reading the body.
  const response = await fetch(parsed, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; distro-source-check/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const type = response.headers.get('content-type') ?? ''
  if (!/html/i.test(type)) throw new Error(`not HTML (${type || 'no content-type'})`)

  if (!response.body) throw new Error('empty body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel()
      throw new Error('page too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function isPrivateHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h.includes(':')) return true // IPv6 literals: no real article lives on one
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!ip) return false
  const [a, b] = [Number(ip[1]), Number(ip[2])]
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

// ---------------------------------------------------------------------------
// Text

// Inline tags join the words around them ("<b>62</b>%" -> "62%"); every other tag is a break.
const INLINE_TAGS = 'a|abbr|b|bdi|bdo|cite|code|data|dfn|em|font|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|wbr'

function htmlToText(html: string) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(new RegExp(`</?(?:${INLINE_TAGS})\\b[^>]*>`, 'gi'), '')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: "'", rsquo: "'", sbquo: "'", ldquo: '"', rdquo: '"', bdquo: '"',
  ndash: '-', mdash: '-', hellip: '...', laquo: '"', raquo: '"',
  pound: '£', euro: '€', cent: '¢', copy: '©', reg: '®', trade: '™', percnt: '%',
}

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}

// Lowercase and collapse whitespace, as CLAUDE.md says. Curly quotes, dashes and
// non-breaking spaces are folded the same way on both the page and the quote, so
// typography alone can't fail a quote that is really there.
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\s ​]+/g, ' ')
    .trim()
}

// "1,200" and "1200" count as the same number; "2.5" stays "2.5".
function numbersIn(text: string) {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,(?=\d{3}\b)/g, ''))
}

// ---------------------------------------------------------------------------
// Dates

const DATE_META = [
  'article:published_time', 'og:published_time', 'published_time', 'datepublished', 'date',
  'dc.date', 'dc.date.issued', 'dcterms.created', 'pubdate', 'publishdate', 'publish-date',
  'publication_date', 'sailthru.date', 'parsely-pub-date', 'citation_publication_date',
]

// The page's published date as YYYY-MM-DD: meta tags first, then JSON-LD, then a <time> element.
function pageDate(html: string, now: Date): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attr(tag, 'property') ?? attr(tag, 'name') ?? attr(tag, 'itemprop')
    if (key && DATE_META.includes(key.toLowerCase())) {
      const day = toDay(attr(tag, 'content'), now)
      if (day) return day
    }
  }
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/i)
  if (ld) {
    const day = toDay(ld[1], now)
    if (day) return day
  }
  const time = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i)
  return time ? toDay(time[1], now) : null
}

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[1] ?? match[2]) : null
}

// Any parseable date -> "YYYY-MM-DD". Dates in the future are ignored.
function toDay(value: string | null | undefined, now = new Date()): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00Z`) : new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null
  if (date.getUTCFullYear() < 1990) return null
  return date.toISOString().slice(0, 10)
}

function isOlderThan(day: string, months: number, now: Date) {
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months)
  return new Date(`${day}T00:00:00Z`).getTime() < cutoff.getTime()
}
