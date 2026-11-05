// mark-failed: the Brief screen calls this when a request is still queued 5 minutes
// after run_started_at. The browser never marks a failure itself; this function
// checks the time on the server and only then sets failed and logs brief_failed.

import { RUN_TIMEOUT_MS, TIMEOUT_MESSAGE } from '../_shared/config.ts'
import { json, preflight, readRequestId } from '../_shared/http.ts'
import { adminClient, getUser, logEvent } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = adminClient()
  const user = await getUser(req, admin)
  if (!user) return json({ error: 'Not signed in' }, 401)

  const requestId = await readRequestId(req)
  if (!requestId) return json({ error: 'request_id is required' }, 400)

  const cutoff = new Date(Date.now() - RUN_TIMEOUT_MS).toISOString()
  const { data: failed, error } = await admin
    .from('requests')
    .update({ status: 'failed', error_message: TIMEOUT_MESSAGE })
    .eq('id', requestId)
    .eq('user_id', user.id)
    .eq('status', 'queued')
    .lte('run_started_at', cutoff)
    .select('id')
    .maybeSingle()
  if (error) return json({ error: 'Could not update the request' }, 500)

  if (failed) {
    await logEvent(admin, user.id, 'brief_failed', { request_id: requestId, error_message: TIMEOUT_MESSAGE })
    return json({ status: 'failed' })
  }

  // Not failed: either not the user's, not queued any more, or not 5 minutes old yet.
  const { data: current } = await admin
    .from('requests')
    .select('status')
    .eq('id', requestId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!current) return json({ error: 'Request not found' }, 404)
  return json({ status: current.status })
})
