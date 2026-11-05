import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

// Service role client: bypasses RLS, so every query that touches user data must
// filter by the user it has already checked.
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// The signed-in user behind the request's Authorization header, or null.
export async function getUser(req: Request, admin: SupabaseClient) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : data.user
}

// The events the edge functions write. The browser writes the other five.
type ServerEvents = {
  brief_ready: { request_id: string; verified_count: number; seconds_to_ready: number }
  brief_failed: { request_id: string; error_message: string }
}

export async function logEvent<Name extends keyof ServerEvents>(
  admin: SupabaseClient,
  userId: string,
  name: Name,
  properties: ServerEvents[Name],
) {
  const { error } = await admin.from('events').insert({ user_id: userId, name, properties })
  if (error) console.error(`Event ${name} not logged:`, error.message)
}

export type AuditRow = {
  user_id: string
  request_id: string
  function_name: 'generate-brief' | 'generate-draft'
  model: string
  prompt_version: string
  input_tokens: number | null
  output_tokens: number | null
  web_searches: number | null
  status: 'success' | 'error'
  error_message: string | null
  latency_ms: number
}

// One row per Claude call, success or error.
export async function writeAudit(admin: SupabaseClient, row: AuditRow) {
  const { error } = await admin.from('api_audit_log').insert(row)
  if (error) console.error('api_audit_log row not written:', error.message)
}
