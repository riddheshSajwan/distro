# distro

## How we work
- We build **one prompt at a time**. Do only what the current prompt asks. Never jump ahead to migrations, edge functions or screens that haven't been requested.
- When a message says "do not build", reply in prose only and write no code.
- When a new instruction conflicts with this file, flag the conflict before building.
- All work happens on `develop`. Never commit to `main`; the user merges `develop` into `main` through a PR.
- Commit only when asked. No Claude co-author or "Generated with" lines in commits or PRs.

## Product
distro takes a LinkedIn topic that a B2B marketer has already picked. It returns a one-page brief of sourced facts and a first draft in their page's voice. The marketer edits the draft, gets it approved and posts it themselves.
- **User:** a marketer at a lean B2B company who owns the company LinkedIn page and needs manager approval on every post. The beta has 5 known marketers.
- **Job:** "When I have picked this week's topic, get me the facts, the sources and a first draft that sounds like our page, without losing half a day to research."

## Stack and commands
- React + TypeScript, Vite, Tailwind v4, Supabase (auth, Postgres, edge functions). Inter comes from `@fontsource/inter` (400 and 600).
- Everything lives in this repo: screens, migrations and edge functions. Edge functions are deployed with the Supabase CLI.
- `npm run dev`, `npm run build`, `npm run lint`. Lint runs oxlint and then `scripts/check-tokens.mjs`.
- During development, auth uses Supabase's built-in email. Set up our own SMTP before inviting beta users.

## Screens
There are only four: Login, Requests, Brief and Voice. Every screen except Login shares one header: "distro" on the left (links to Requests), and Voice and Sign out links on the right. Until the user has a `pages` row, every screen except Login redirects to Voice.

**Login**
- Shows the name, one line on what it does, an email field and "Send magic link".
- After sending, shows "Check your email for a sign-in link" with the address and a "Use a different email" link.
- An invalid email shows an inline error. If sending fails, show a plain error and keep the button active.
- On first login (no `pages` row) go to Voice; after that, go to Requests.

**Requests (home)**
- A Card holds:
  - Topic (required, one line)
  - Angle (optional, one line)
  - "Include draft" toggle, on by default
  - "Get brief", disabled until Topic is filled
- On send:
  1. insert a `requests` row with `status = queued` and `run_started_at = now()`
  2. log `request_created`
  3. call `generate-brief`
  4. open the request's Brief screen
- Below the card, list all the user's requests, newest first. Each row shows the topic, the angle on one line with an ellipsis, a status badge, the verified fact count ("–" while queued or failed) and the created date. Tapping a row opens its Brief.
- Empty state: "Send your first topic and distro will come back with a sourced brief."
- Loading shows a skeleton. On error, show a plain message and a retry.

**Brief (one request)**
- Header: the topic as title, angle, status badge, created date and "Back to requests".
- **Queued:** shows "Researching your topic. This usually takes under two minutes." Poll every 3s while queued and stop when the status changes.
  - If the request is still queued 5 min after `run_started_at`, call the edge function to mark it failed with "This took too long. Try again." The browser never marks a failure itself.
- **Failed:** show `error_message` and "Try again". Try again reuses the same row: delete its facts, reset `run_started_at`, set the status back to `queued` and re-run everything.
- **Ready, facts:**
  - Show at most 6 facts, all `verified = true`, in the model's order. Each shows the fact text, the source title linked in a new tab, the published date if known, and a Used tick.
  - Ticking saves `used = true` and logs `fact_marked_used`. Unticking saves `used = false` and logs nothing.
  - If only 1–4 facts are verified, show "Only N facts could be checked against their sources."
- **Ready, draft** (only when `include_draft` is on):
  - An editable Textarea at 16px / 1.6, starting from `draft_text`. Edits autosave to `final_text` 1s after typing stops, with a small muted "Saved".
  - **Copy** copies the current text, saves it to `final_text`, logs `draft_copied` and briefly shows "Copied".
  - If the draft failed, the draft section shows `error_message` (only there) and a "Write draft again" button.
  - While a draft is being rewritten, show "Writing the draft..." and poll until `draft_text` or `error_message` is set.
- **Mark as posted:**
  - Opens an inline URL field with Save and Cancel. The URL must contain `linkedin.com`, otherwise show an inline error.
  - Saving sets `posted_url`, `posted_at` and `status = posted`, and logs `request_posted`. It can't be undone and the URL can't be edited.
  - When the draft is off, there's no draft section, and Mark as posted sits at the bottom of the screen. A draft can't be added later.
- **Posted:** the same as Ready, plus a Posted badge and the LinkedIn link. The draft becomes read-only; Used ticks and Copy still work.

**Voice**
- Page name (required, one line).
- Past posts: up to 10 large boxes, each ≤3,000 characters, with "Add another post" and remove links.
- House rules: up to 10 one-line inputs, each ≤120 characters, with "Add a rule" and remove links.
- "Save voice" drops empty boxes, upserts the user's single `pages` row, logs `voice_saved` and goes to Requests.
- Zero posts are allowed. When there are none, show a line explaining that 3 or more past posts make the draft sound like the page.
- If saving fails, show a plain error and lose nothing from the boxes.
- Existing posts and rules load into the boxes for editing. Voice is shown after the first login and is otherwise reached from the header.

## Data
Every `user_id` references `auth.users(id)`. There is no `public.users` table.
- **pages:** id, user_id, page_name, voice_posts text[] (≤10), house_rules text[] (≤10), created_at. One per user in v1.
- **requests:** id, user_id, page_id, topic, angle, include_draft, status (`queued|ready|failed|posted`), draft_text, final_text, posted_url, prompt_version, error_message, created_at, **run_started_at**, ready_at, posted_at.
- **facts:** id, request_id, user_id, fact_text, source_url, source_title, **source_quote**, published_on, verified, used, created_at.
- **events:** id, user_id, name, properties (jsonb), created_at.
- **api_audit_log:** id, user_id, request_id, function_name, model, prompt_version, input_tokens, output_tokens, web_searches, status, error_message, latency_ms, created_at.
- `source_quote` and `run_started_at` are the only two columns added beyond the original spec.
- RLS is on for every table, and users can only reach their own rows. `api_audit_log` has no user policies; only the service role writes to it, from edge functions.
- `created_at` never changes. Timeouts and `seconds_to_ready` use `run_started_at`.

## Pipeline (edge functions)
- **Model:** use `claude-haiku-5-5` for both jobs, defined in one shared file that both functions import. The API key never reaches the browser.
- Every Claude call writes one `api_audit_log` row.
- `prompt_version` is `"brief_v1+draft_v1"`, or `"brief_v1"` when the draft is off.
- **generate-brief** (called by the browser):
  - Reply immediately and keep working in the background.
  - Research uses Haiku with web search, `max_uses: 5`. Ask for 8 candidate facts, each with a `source_quote`.
  - Run the source check, then save the facts.
  - Mark only the first 6 passing facts `verified = true`, in model order. Extra passing facts are saved with `verified = false`.
  - If 0 facts pass, set the request to failed with "No facts could be checked against their sources. Try a different angle." Never re-run research automatically.
  - If `include_draft` is on, call `generate-draft` on the server.
- **generate-draft:**
  - Write only from verified facts, using the page's current voice.
  - Called by the browser for "Write draft again": check the user's login and that they own the request.
  - If the request is `queued` (part of the first run), leave `run_started_at`, `draft_text` and `error_message` alone.
  - If the request is `ready` (a rewrite), first clear `draft_text` and `error_message` and reset `run_started_at`. The status stays `ready`.
  - On failure, set `error_message` to "The draft could not be written." and keep the status `ready`.
  - If a rewrite produces nothing within 5 min of `run_started_at`, the function sets that same message.
- **Ready:** a request is ready when the facts are done and, if the draft is on, the draft has been attempted. Set `ready_at` at that moment.
  - The status may only change to `ready` from `queued`, so a late finish never overwrites a failure.
- **Mark failed:** the endpoint the Brief screen calls on timeout. It sets the request to failed and logs `brief_failed`.

## Source check (plain code, never the model)
- Fetch the source page with a 10s timeout. Strip the HTML, lowercase it and collapse whitespace.
- Keep a fact only if:
  - its `source_quote` appears on the page, and
  - every number in the fact appears in the quote.
- Paywalls, pages that need JavaScript, timeouts and errors all mean `verified = false`. When in doubt, drop the fact.
- **Published date:**
  - Use the page's date if it has one (for example `article:published_time` or a date shown on the page); otherwise use the model's.
  - Drop the fact if that date is more than 18 months old.
  - If there's no date from either, keep the fact and leave `published_on` null.
- Only `verified = true` facts are ever shown.

## Events
Log exactly these seven events and no others.

| name | written by | properties |
|---|---|---|
| request_created | browser | request_id, include_draft, has_angle |
| brief_ready | edge fn | request_id, verified_count, seconds_to_ready |
| brief_failed | edge fn | request_id, error_message |
| fact_marked_used | browser | request_id, fact_id |
| voice_saved | browser | post_count, rule_count, first_save |
| draft_copied | browser | request_id |
| request_posted | browser | request_id |

- The browser inserts its events directly, with RLS limiting each user to their own rows.
- **Focus metric:** weekly returning marketers, from `request_created`.
- **Guardrail metric:** share of facts used, from `facts.used` over the verified facts.

## Not in v1
- No LinkedIn integration of any kind. This is a product decision, not a v1 limitation.
- No topic suggestions.
- No recap, analytics or impressions entry. That comes after the beta.
- No teams and no in-app approval.
- No email or Slack delivery.
- Text posts only.
- No payments.
- No settings page.
- No mobile app.
- No per-user token limit yet. It comes later and will read from `api_audit_log`.

## Design system
**Rules:**
- Never introduce a colour, size or radius that isn't a token.
- Never create a second version of a component that already exists.
- Mobile first: everything must work at 375px wide.
- Page content is never wider than 720px.

**Tokens** live only in `src/styles/tokens.css`. It clears Tailwind's defaults, so off-token classes (`p-5`, `bg-blue-500`, `shadow-md`) produce no CSS. `check-tokens.mjs` fails on raw colours, arbitrary values like `p-[13px]`, and inline styles.
- **Colours:**
  - `background` #FFFFFF, `surface` #F6F7F9, `border` #E3E6EB
  - `text` #14171F, `text-muted` #5F6673
  - `accent` #2B4C7E, `danger` #B42318, `success` #1F7A4D
- **Type:** Inter, regular and semibold only.
  - `text-display` 32 / 1.25, `text-title` 20 / 1.4, `text-body` 16 / 1.6, `text-small` 13 / 1.5
  - Brief text is 16 / 1.6; it is read like a memo.
- **Spacing:** base 8. Class numbers are multiples of 8: `0`, `1` = 8, `2` = 16, `3` = 24, `4` = 32, `6` = 48. Nothing else.
- **Radius:** `rounded-base` (8px) everywhere. No shadows. Cards get a 1px `border-border`.
- **Width:** `max-w-content` (720px). Wrap every screen in `PageContainer`.
- **Agreed exceptions:**
  - A 2px accent focus outline, offset 2px.
  - Disabled controls at 50% opacity.
  - Primary and danger buttons don't darken on hover.

**Components** in `src/components/` (reuse them, never fork them):
- Button (primary, secondary, danger)
- Input
- Textarea (with character counter)
- Toggle
- Card
- List, ListRow and ListRowSkeleton (loading placeholder)
- StatusBadge: queued `text-muted`, ready `accent`, failed `danger`, posted `success`
- EmptyState (also used for load errors, with a Retry action)
- PageContainer
- Field (the shared label and error layout)
- TextLink (router link, or a button that looks like a link; `accent` or `muted`)
- AppHeader (the shared header)

`src/Showcase.tsx` is the design system check page, served at `/design` in local dev only.

## Code layout
- `src/screens/` holds one file per screen. `src/auth/` holds the session provider and `RequireAuth`, which guards every route except `/login`.
- Routes: `/login` and `/` (Requests). The Brief and Voice routes are added in their own prompts.
- `src/lib/supabase.ts` is the only Supabase client. `src/lib/database.types.ts` is generated: run `npm run gen:types` after every migration.
- `npm run test:rls` runs the manual RLS check against the linked project.
- `vercel.json` rewrites every path to `index.html`, so the app works as a single page app.
