import { supabase } from './supabase'

// Browser entry points into the AI pipeline. Each one calls an edge function with
// the signed-in user's session; the functions check ownership themselves.

async function invoke(name: string, requestId: string) {
  const { error } = await supabase.functions.invoke(name, { body: { request_id: requestId } })
  if (error) throw error
}

// Called right after a new request row is inserted and request_created is logged.
// generate-brief replies at once and researches in the background. If this call
// never reaches it, the request stays queued and the 5 minute timeout fails it,
// so the error is only logged here.
export async function startBrief(requestId: string): Promise<void> {
  try {
    await invoke('generate-brief', requestId)
  } catch (error) {
    console.error('generate-brief could not be started:', error)
  }
}

// "Try again" on a failed request. generate-brief resets the same row (deletes its
// facts, new run_started_at, back to queued) and runs everything again. Throws so
// the Brief screen can say it didn't start.
export async function retryBrief(requestId: string): Promise<void> {
  await invoke('generate-brief', requestId)
}

// The Brief screen calls this once a request has been queued for 5 minutes. The
// server checks the time itself and only then marks it failed.
export async function markTimedOut(requestId: string): Promise<void> {
  await invoke('mark-failed', requestId)
}

// "Write draft again" when the draft failed on a ready request. Filled in by Prompt 5 Part B.
export async function retryDraft(requestId: string): Promise<void> {
  void requestId
}
