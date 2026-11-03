// Manual RLS test for the data model. Run with: npm run test:rls
// It signs in as two real accounts with the public anon key (exactly what the browser will
// use), tries each action, and prints what Supabase actually answered next to what it should.
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const results = []

function client() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function describe({ data, error }) {
  if (error) return `refused: ${error.message}`
  if (Array.isArray(data)) return `${data.length} row(s)`
  return 'allowed'
}

function record(step, expected, response, ok) {
  const actual = describe(response)
  results.push({ step, expected, actual, ok })
  console.log(`\n${step}\n  expected: ${expected}\n  actual:   ${actual}\n  ${ok ? 'MATCHES' : 'DOES NOT MATCH'}`)
}

const refused = (r) => Boolean(r.error)
const rows = (n) => (r) => !r.error && Array.isArray(r.data) && r.data.length === n

async function signIn(label) {
  const email = await rl.question(`Account ${label} email: `)
  const password = await rl.question(`Account ${label} password: `)
  const supabase = client()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.error(`Could not sign in as ${label}: ${error.message}`)
    process.exit(1)
  }
  console.log(`Signed in as ${label}: ${data.user.email} (user id ${data.user.id})`)
  return { supabase, userId: data.user.id }
}

console.log('distro RLS test. Use the two test accounts you created in the Supabase dashboard.\n')
const a = await signIn('A')
const b = await signIn('B')

// 1. Account A creates its page (if it has none yet) and a request.
let { data: page } = await a.supabase.from('pages').select('id').maybeSingle()
if (!page) {
  const created = await a.supabase.from('pages').insert({ user_id: a.userId, page_name: 'RLS test page' }).select('id').single()
  record('1a. A creates its page', 'allowed', created, !created.error)
  page = created.data
}
const request = await a.supabase
  .from('requests')
  .insert({ user_id: a.userId, page_id: page.id, topic: `RLS test ${new Date().toISOString()}` })
  .select('id, topic, status')
  .single()
record('1b. A creates a request', 'allowed', request, !request.error)
if (request.error) process.exit(1)
const requestId = request.data.id

// 2. Account A tries to add a fact itself. Only edge functions may.
const ownFact = await a.supabase
  .from('facts')
  .insert({ request_id: requestId, user_id: a.userId, fact_text: 'Made up by A', source_url: 'https://example.com', verified: true })
record('2. A tries to insert a fact (and mark it verified)', 'refused', ownFact, refused(ownFact))

// 3. You add a fact in the Table Editor, which runs with admin rights.
console.log(`
Now add a fact by hand in the Supabase dashboard:
  Table Editor > facts > Insert > Insert row, and fill in:
    request_id  ${requestId}
    user_id     ${a.userId}
    fact_text   Test fact for the RLS check
    source_url  https://example.com
  Leave every other field as it is, then click Save.`)
await rl.question('\nPress Enter once the row is saved...')

// 4. Account A can see its own request and fact.
const aRequests = await a.supabase.from('requests').select('id').eq('id', requestId)
record('4a. A reads its request', '1 row(s)', aRequests, rows(1)(aRequests))
const aFacts = await a.supabase.from('facts').select('id, verified, used').eq('request_id', requestId)
record('4b. A reads the fact you added', '1 row(s)', aFacts, rows(1)(aFacts))
const factId = aFacts.data?.[0]?.id

// 5. Account A may tick "used", but never touch "verified".
if (factId) {
  const used = await a.supabase.from('facts').update({ used: true }).eq('id', factId).select('used')
  record('5a. A marks the fact as used', '1 row(s)', used, rows(1)(used))
  const verified = await a.supabase.from('facts').update({ verified: true }).eq('id', factId)
  record('5b. A tries to set verified = true', 'refused', verified, refused(verified))
}

// 6. Account B sees none of A's data, even when asking for it by id.
const bRequests = await b.supabase.from('requests').select('id').eq('id', requestId)
record("6a. B reads A's request by its id", '0 row(s)', bRequests, rows(0)(bRequests))
const bFacts = await b.supabase.from('facts').select('id').eq('request_id', requestId)
record("6b. B reads A's facts", '0 row(s)', bFacts, rows(0)(bFacts))
const bUpdate = await b.supabase.from('requests').update({ topic: 'changed by B' }).eq('id', requestId).select('id')
record("6c. B tries to edit A's request", '0 row(s)', bUpdate, rows(0)(bUpdate))

// 7. Neither account can read the audit log.
const aAudit = await a.supabase.from('api_audit_log').select('id')
record('7a. A reads api_audit_log', 'refused', aAudit, refused(aAudit))
const bAudit = await b.supabase.from('api_audit_log').select('id')
record('7b. B reads api_audit_log', 'refused', bAudit, refused(bAudit))

// 8. Someone who is not signed in gets nothing at all.
const anon = await client().from('requests').select('id')
record('8. Signed-out visitor reads requests', 'refused', anon, refused(anon))

rl.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} of ${results.length} steps matched what was expected.`)
if (failed.length) {
  console.log('Did not match:')
  for (const r of failed) console.log(`  ${r.step}: expected ${r.expected}, got ${r.actual}`)
  process.exit(1)
}
