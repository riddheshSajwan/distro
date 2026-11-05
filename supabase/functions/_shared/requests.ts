import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { requestPromptVersion } from './config.ts'
import { logEvent } from './supabase.ts'

export type RunRequest = {
  id: string
  user_id: string
  include_draft: boolean
  run_started_at: string
}

// A request is ready when its facts are done and, with the draft on, the draft has been
// attempted. Ready only from queued, and only for the run that owns run_started_at, so a
// late finish never overwrites a failure or a newer run. Returns false if it lost that race.
export async function markReady(admin: SupabaseClient, request: RunRequest, runToken: string): Promise<boolean> {
  const readyAt = new Date()
  const { data: ready, error } = await admin
    .from('requests')
    .update({
      status: 'ready',
      ready_at: readyAt.toISOString(),
      prompt_version: requestPromptVersion(request.include_draft),
    })
    .eq('id', request.id)
    .eq('status', 'queued')
    .eq('run_started_at', runToken)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Request not marked ready: ${error.message}`)
  if (!ready) return false

  const { count } = await admin
    .from('facts')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', request.id)
    .eq('verified', true)

  await logEvent(admin, request.user_id, 'brief_ready', {
    request_id: request.id,
    verified_count: count ?? 0,
    seconds_to_ready: Math.round((readyAt.getTime() - new Date(runToken).getTime()) / 1000),
  })
  return true
}
