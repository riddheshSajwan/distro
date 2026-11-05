// generate-brief: called by the browser after it inserts a request ("Get brief"),
// and again for "Try again" on a failed request.
//
// It checks the login and ownership, replies straight away and keeps working in the
// background: research with Haiku + web search, the source check, then saves the
// facts and marks the request ready (or failed when no fact passes).
//
// Part A of Prompt 5 ignores include_draft; Part B adds the draft before ready.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { BRIEF_PROMPT_VERSION, NO_FACTS_MESSAGE, RESEARCH_ERROR_MESSAGE } from '../_shared/config.ts'
import { json, preflight, readRequestId } from '../_shared/http.ts'
import { checkSource } from '../_shared/sourceCheck.ts'
import { adminClient, getUser, logEvent } from '../_shared/supabase.ts'
import { research } from './research.ts'

const MAX_VERIFIED = 6

// Supabase's edge runtime global: keeps the worker alive for background work after the response.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

type RequestRow = {
  id: string
  user_id: string
  topic: string
  angle: string | null
  status: string
  run_started_at: string
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = adminClient()
  const user = await getUser(req, admin)
  if (!user) return json({ error: 'Not signed in' }, 401)

  const requestId = await readRequestId(req)
  if (!requestId) return json({ error: 'request_id is required' }, 400)

  const { data: found, error } = await admin
    .from('requests')
    .select('id, user_id, topic, angle, status, run_started_at')
    .eq('id', requestId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return json({ error: 'Could not read the request' }, 500)
  if (!found) return json({ error: 'Request not found' }, 404)

  let request = found as RequestRow

  if (request.status === 'failed') {
    // Try again reuses the same row: back to queued with a fresh run_started_at
    // (only if it is still failed, so a double tap starts one run), then delete its facts.
    const { data: reset, error: resetError } = await admin
      .from('requests')
      .update({ status: 'queued', run_started_at: new Date().toISOString(), error_message: null, ready_at: null })
      .eq('id', request.id)
      .eq('status', 'failed')
      .select('id, user_id, topic, angle, status, run_started_at')
      .maybeSingle()
    if (resetError) return json({ error: 'Could not restart the request' }, 500)
    if (!reset) return json({ error: 'Request is no longer failed' }, 409)
    request = reset as RequestRow

    const { error: deleteError } = await admin.from('facts').delete().eq('request_id', request.id)
    if (deleteError) console.error('Old facts not deleted:', deleteError.message)
  } else if (request.status !== 'queued') {
    return json({ error: `Request is already ${request.status}` }, 409)
  }

  EdgeRuntime.waitUntil(runBrief(admin, request))
  return json({ status: 'queued' }, 202)
})

// The run is identified by run_started_at. Every write checks the row is still queued
// with the same run_started_at, so a run that was timed out or replaced by Try again
// can never overwrite the newer state.
async function runBrief(admin: SupabaseClient, request: RequestRow) {
  const runToken = request.run_started_at
  const stillCurrent = async () => {
    const { data } = await admin
      .from('requests')
      .select('id')
      .eq('id', request.id)
      .eq('status', 'queued')
      .eq('run_started_at', runToken)
      .maybeSingle()
    return !!data
  }

  try {
    const candidates = await research({
      admin,
      userId: request.user_id,
      requestId: request.id,
      topic: request.topic,
      angle: request.angle,
    })

    const checks = await Promise.all(candidates.map((c) => checkSource(c)))
    checks.forEach((check, i) => console.log(`fact ${i + 1}: ${check.passed ? 'passed' : 'dropped'} (${check.reason}) ${candidates[i].source_url}`))

    if (!(await stillCurrent())) return

    // Save every fact. Only the first 6 that pass are verified, in model order, and
    // each gets a later created_at than the one before so the Brief keeps that order.
    const base = Date.now()
    let verifiedCount = 0
    const rows = candidates.map((c, i) => {
      const verified = checks[i].passed && verifiedCount < MAX_VERIFIED
      if (verified) verifiedCount++
      return {
        request_id: request.id,
        user_id: request.user_id,
        fact_text: c.fact_text,
        source_url: c.source_url,
        source_title: c.source_title || null,
        source_quote: c.source_quote || null,
        published_on: checks[i].published_on,
        verified,
        created_at: new Date(base + i).toISOString(),
      }
    })

    let savedIds: string[] = []
    if (rows.length) {
      const { data, error } = await admin.from('facts').insert(rows).select('id')
      if (error) throw new Error(`Facts not saved: ${error.message}`)
      savedIds = data.map((r: { id: string }) => r.id)
    }

    if (verifiedCount === 0) {
      await failRun(admin, request, runToken, NO_FACTS_MESSAGE)
      return
    }

    // Ready only from queued, and only for this run.
    const readyAt = new Date()
    const { data: ready, error } = await admin
      .from('requests')
      .update({ status: 'ready', ready_at: readyAt.toISOString(), prompt_version: BRIEF_PROMPT_VERSION })
      .eq('id', request.id)
      .eq('status', 'queued')
      .eq('run_started_at', runToken)
      .select('id')
      .maybeSingle()
    if (error) throw new Error(`Request not marked ready: ${error.message}`)

    if (!ready) {
      // Timed out or restarted while the facts were being saved: take this run's facts back out.
      if (savedIds.length) await admin.from('facts').delete().in('id', savedIds)
      return
    }

    await logEvent(admin, request.user_id, 'brief_ready', {
      request_id: request.id,
      verified_count: verifiedCount,
      seconds_to_ready: Math.round((readyAt.getTime() - new Date(runToken).getTime()) / 1000),
    })
  } catch (error) {
    console.error(`generate-brief ${request.id} failed:`, error instanceof Error ? error.message : error)
    await failRun(admin, request, runToken, RESEARCH_ERROR_MESSAGE)
  }
}

async function failRun(admin: SupabaseClient, request: RequestRow, runToken: string, message: string) {
  const { data } = await admin
    .from('requests')
    .update({ status: 'failed', error_message: message, prompt_version: BRIEF_PROMPT_VERSION })
    .eq('id', request.id)
    .eq('status', 'queued')
    .eq('run_started_at', runToken)
    .select('id')
    .maybeSingle()
  if (data) await logEvent(admin, request.user_id, 'brief_failed', { request_id: request.id, error_message: message })
}
