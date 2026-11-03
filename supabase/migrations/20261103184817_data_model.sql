-- Prompt 2: data model.
-- "Automatically expose new tables" is off on this project, so every privilege is granted here
-- explicitly. anon gets nothing. authenticated gets only what its RLS policies allow.
-- service_role (edge functions) bypasses RLS but still needs table privileges.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  page_name   text not null check (char_length(btrim(page_name)) > 0),
  voice_posts text[] not null default '{}' check (cardinality(voice_posts) <= 10),
  house_rules text[] not null default '{}' check (cardinality(house_rules) <= 10),
  created_at  timestamptz not null default now()
);

create table public.requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  page_id        uuid not null references public.pages (id) on delete cascade,
  topic          text not null check (char_length(btrim(topic)) > 0),
  angle          text,
  include_draft  boolean not null default true,
  status         text not null default 'queued'
                 check (status in ('queued', 'ready', 'failed', 'posted')),
  draft_text     text,
  final_text     text,
  posted_url     text,
  prompt_version text,
  error_message  text,
  created_at     timestamptz not null default now(),
  run_started_at timestamptz not null default now(),
  ready_at       timestamptz,
  posted_at      timestamptz
);

create index requests_user_id_created_at_idx on public.requests (user_id, created_at desc);

create table public.facts (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.requests (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  fact_text    text not null,
  source_quote text,
  source_url   text not null,
  source_title text,
  published_on date,
  -- Set by the source check in the edge function, never by the model or the user.
  verified     boolean not null default false,
  used         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index facts_request_id_idx on public.facts (request_id);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (name in (
               'request_created', 'brief_ready', 'brief_failed', 'fact_marked_used',
               'voice_saved', 'draft_copied', 'request_posted'
             )),
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.api_audit_log (
  id             uuid primary key default gen_random_uuid(),
  -- set null, not cascade: cost history outlives a deleted user or request.
  user_id        uuid references auth.users (id) on delete set null,
  request_id     uuid references public.requests (id) on delete set null,
  function_name  text not null check (function_name in ('generate-brief', 'generate-draft')),
  model          text not null,
  prompt_version text,
  input_tokens   integer,
  output_tokens  integer,
  web_searches   integer,
  status         text not null check (status in ('success', 'error')),
  error_message  text,
  latency_ms     integer,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.pages, public.requests, public.facts, public.events, public.api_audit_log
  from anon, authenticated;

grant select, insert, update on public.pages    to authenticated;
grant select, insert, update on public.requests to authenticated;
grant select                 on public.facts    to authenticated;
grant update (used)          on public.facts    to authenticated;
grant insert                 on public.events   to authenticated;
-- api_audit_log: nothing for authenticated.

grant select, insert, update, delete
  on public.pages, public.requests, public.facts, public.events, public.api_audit_log
  to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.pages         enable row level security;
alter table public.requests      enable row level security;
alter table public.facts         enable row level security;
alter table public.events        enable row level security;
alter table public.api_audit_log enable row level security;

-- pages: read, insert and update your own row.
create policy "pages: select own" on public.pages
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "pages: insert own" on public.pages
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "pages: update own" on public.pages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- requests: read, insert and update your own rows, and only against your own page.
create policy "requests: select own" on public.requests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "requests: insert own" on public.requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.pages p where p.id = page_id and p.user_id = (select auth.uid()))
  );

create policy "requests: update own" on public.requests
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.pages p where p.id = page_id and p.user_id = (select auth.uid()))
  );

-- facts: read your own; update your own, limited to the used column by the grant above.
-- No insert or delete policy: only edge functions create or remove facts.
create policy "facts: select own" on public.facts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "facts: update used on own" on public.facts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- events: insert your own, browser-side names only. brief_ready and brief_failed
-- come from edge functions. No select policy: events are write-only for users.
create policy "events: insert own browser events" on public.events
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and name in ('request_created', 'fact_marked_used', 'voice_saved', 'draft_copied', 'request_posted')
  );

-- api_audit_log: RLS on, no policies. Only the service role can touch it.
