import { supabase } from './supabase'

// The five events the browser writes, with exactly the properties in CLAUDE.md.
// brief_ready and brief_failed come from edge functions and are not allowed here
// (the events RLS policy rejects them too).
type BrowserEvents = {
  request_created: { request_id: string; include_draft: boolean; has_angle: boolean }
  fact_marked_used: { request_id: string; fact_id: string }
  voice_saved: { post_count: number; rule_count: number; first_save: boolean }
  draft_copied: { request_id: string }
  request_posted: { request_id: string }
}

// Every screen logs through this. It never throws: a lost event must not break
// the action the marketer just took, so failures only go to the console.
export async function logEvent<Name extends keyof BrowserEvents>(name: Name, properties: BrowserEvents[Name]) {
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) {
    console.error(`Event ${name} not logged: no session.`)
    return
  }

  const { error } = await supabase.from('events').insert({ user_id: userId, name, properties })
  if (error) console.error(`Event ${name} not logged:`, error.message)
}
