// generate-draft: writes the first draft from the verified facts in the page's current voice.
//
// Three ways in:
//  1. Server, first run. generate-brief calls it with the service key once the facts are
//     saved, while the request is still queued. run_started_at, draft_text and
//     error_message are left alone; it writes the draft (or the error), then marks the
//     request ready because the draft has now been attempted.
//  2. Browser, "Write draft again" on a ready request whose draft failed. Checks login and
//     ownership, clears draft_text and error_message, resets run_started_at and keeps the
//     status ready, then writes the draft in the background.
//  3. Browser, { timeout: true }. A rewrite that has produced nothing 5 minutes after
//     run_started_at gets "The draft could not be written." The server checks the time.
//
// On failure the request stays ready and error_message is "The draft could not be written."

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { DRAFT_FAILED_MESSAGE, RUN_TIMEOUT_MS } from '../_shared/config.ts'
import { json, preflight } from '../_shared/http.ts'
import { markReady } from '../_shared/requests.ts'
import { adminClient, getUser } from '../_shared/supabase.ts'
import { type DraftRequest, writeDraft } from './draft.ts'

// Supabase's edge runtime global: keeps the worker alive for background work after the response.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

type Row = DraftRequest & {
  status: string
  draft_text: string | null
  error_message: string | null
  run_started_at: string
}

const COLUMNS = 'id, user_id, page_id, topic, angle, include_draft, status, draft_text, error_message, run_started_at'
const UUID = /^[0-9a-f-]{36}$/i

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { request_id?: unknown; run_started_at?: unknown; timeout?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const requestId = typeof body.request_id === 'string' && UUID.test(body.request_id) ? body.request_id : null
  if (!requestId) return json({ error: 'request_id is required' }, 400)

  const admin = adminClient()
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const fromServer = !!token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (fromServer) {
    const runToken = typeof body.run_started_at === 'string' ? body.run_started_at : ''
    return firstRun(admin, requestId, runToken)
  }

  const user = await getUser(req, admin)
  if (!user) return json({ error: 'Not signed in' }, 401)

  const { data: found, error } = await admin
    .from('requests')
    .select(COLUMNS)
    .eq('id', requestId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return json({ error: 'Could not read the request' }, 500)
  if (!found) return json({ error: 'Request not found' }, 404)

  return body.timeout === true ? timeOut(admin, found as Row) : rewrite(admin, found as Row)
})

// 1. Server, first run: the request is queued and belongs to the run in runToken.
async function firstRun(admin: SupabaseClient, requestId: string, runToken: string) {
  const { data: request } = await admin
    .from('requests')
    .select(COLUMNS)
    .eq('id', requestId)
    .eq('status', 'queued')
    .eq('run_started_at', runToken)
    .maybeSingle()
  if (!request || !request.include_draft) return json({ error: 'Request is not waiting for a draft' }, 409)

  EdgeRuntime.waitUntil(
    (async () => {
      const row = request as Row
      const updateThisRun = (values: { draft_text: string } | { error_message: string }) =>
        admin.from('requests').update(values).eq('id', row.id).eq('status', 'queued').eq('run_started_at', runToken)
      try {
        const draft = await writeDraft(admin, row)
        await updateThisRun({ draft_text: draft })
      } catch (error) {
        console.error(`generate-draft ${row.id} (first run) failed:`, error instanceof Error ? error.message : error)
        await updateThisRun({ error_message: DRAFT_FAILED_MESSAGE })
      }
      try {
        await markReady(admin, row, runToken)
      } catch (error) {
        console.error(`generate-draft ${row.id} not marked ready:`, error instanceof Error ? error.message : error)
      }
    })(),
  )
  return json({ status: 'writing' }, 202)
}

// 2. Browser, "Write draft again": only for a ready request whose draft failed.
async function rewrite(admin: SupabaseClient, request: Row) {
  if (request.status !== 'ready' || !request.include_draft || request.draft_text || !request.error_message) {
    return json({ error: 'This draft can not be written again' }, 409)
  }

  // Conditional on the failed state, so a double tap starts one rewrite.
  const { data: reset, error } = await admin
    .from('requests')
    .update({ draft_text: null, error_message: null, run_started_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'ready')
    .is('draft_text', null)
    .not('error_message', 'is', null)
    .select(COLUMNS)
    .maybeSingle()
  if (error) return json({ error: 'Could not restart the draft' }, 500)
  if (!reset) return json({ error: 'This draft can not be written again' }, 409)

  const row = reset as Row
  const runToken = row.run_started_at
  EdgeRuntime.waitUntil(
    (async () => {
      // Writes only land if this rewrite is still the current one and nothing else filled the draft.
      const updateThisRewrite = (values: { draft_text: string } | { error_message: string }) =>
        admin
          .from('requests')
          .update(values)
          .eq('id', row.id)
          .eq('status', 'ready')
          .eq('run_started_at', runToken)
          .is('draft_text', null)
          .is('error_message', null)
      try {
        const draft = await writeDraft(admin, row)
        await updateThisRewrite({ draft_text: draft })
      } catch (error) {
        console.error(`generate-draft ${row.id} (rewrite) failed:`, error instanceof Error ? error.message : error)
        await updateThisRewrite({ error_message: DRAFT_FAILED_MESSAGE })
      }
    })(),
  )
  return json({ status: 'writing' }, 202)
}

// 3. Browser, timeout: a rewrite still empty 5 minutes after run_started_at.
async function timeOut(admin: SupabaseClient, request: Row) {
  const cutoff = new Date(Date.now() - RUN_TIMEOUT_MS).toISOString()
  const { data: timedOut, error } = await admin
    .from('requests')
    .update({ error_message: DRAFT_FAILED_MESSAGE })
    .eq('id', request.id)
    .eq('status', 'ready')
    .eq('include_draft', true)
    .is('draft_text', null)
    .is('error_message', null)
    .lte('run_started_at', cutoff)
    .select('id')
    .maybeSingle()
  if (error) return json({ error: 'Could not update the request' }, 500)
  return json({ status: timedOut ? 'timed_out' : 'unchanged' })
}
