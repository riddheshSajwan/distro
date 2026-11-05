// CORS and JSON helpers shared by every function the browser calls.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function preflight(req: Request) {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null
}

// Reads { request_id } from the body. Returns null when it is missing or not a uuid.
export async function readRequestId(req: Request): Promise<string | null> {
  try {
    const body = await req.json()
    const id = typeof body?.request_id === 'string' ? body.request_id : ''
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null
  } catch {
    return null
  }
}
