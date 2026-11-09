-- MKule News — run this in the News Supabase project only.
-- Dashboard → SQL Editor → New query → paste → Run. Then refresh the API cache (last line).
--
-- Nothing here belongs to MKuLayout: the layout tool keeps its own project, its own
-- tables and its own keys. Both tables below are reachable only by a signed-in user, and
-- the Google provider must be switched on under Authentication → Providers first.

-- ---------------------------------------------------------------------------
-- The board: one JSON document the whole section shares, plus a revision counter.
-- Every write is a compare-and-set on rev, so two editors cannot clobber each other.
-- ---------------------------------------------------------------------------
create table if not exists public.news_board (
  id          int primary key,
  doc         jsonb not null,
  rev         int  not null default 0,
  updated_by  text not null default '',
  updated_at  timestamptz not null default now()
);

-- The singleton row the desk reads on boot. An empty document hydrates back into the
-- seeded roster, so this is a valid starting board.
insert into public.news_board (id, doc, rev)
values (1, '{}'::jsonb, 0)
on conflict (id) do nothing;

alter table public.news_board enable row level security;

-- Dropped before creating so running this file twice is a refresh, not an error.
drop policy if exists news_board_read on public.news_board;
create policy news_board_read on public.news_board
  for select to authenticated using (true);

drop policy if exists news_board_insert on public.news_board;
create policy news_board_insert on public.news_board
  for insert to authenticated with check (true);

drop policy if exists news_board_write on public.news_board;
create policy news_board_write on public.news_board
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Assessments: one row per sheet, never inside the shared document. Row-level security,
-- not the UI, is what keeps a rating visible only to the person who wrote it and the
-- person it is about.
-- ---------------------------------------------------------------------------
create table if not exists public.news_assessments (
  id            text primary key,
  kind          text not null check (kind in ('monthly', 'semestral')),
  period        text not null,
  rater_email   text not null,
  subject_email text not null,
  scores        jsonb not null default '{}'::jsonb,
  comments      text not null default '',
  updated_at    timestamptz not null default now()
);

create index if not exists news_assessments_rater   on public.news_assessments (lower(rater_email));
create index if not exists news_assessments_subject on public.news_assessments (lower(subject_email));

alter table public.news_assessments enable row level security;

drop policy if exists news_assessments_read on public.news_assessments;
create policy news_assessments_read on public.news_assessments
  for select to authenticated
  using (
    lower(rater_email)   = lower(coalesce(auth.email(), ''))
    or lower(subject_email) = lower(coalesce(auth.email(), ''))
  );

-- Only the rater may file their own sheet; the subject reads it, never rewrites it.
drop policy if exists news_assessments_insert on public.news_assessments;
create policy news_assessments_insert on public.news_assessments
  for insert to authenticated
  with check (lower(rater_email) = lower(coalesce(auth.email(), '')));

drop policy if exists news_assessments_update on public.news_assessments;
create policy news_assessments_update on public.news_assessments
  for update to authenticated
  using (lower(rater_email) = lower(coalesce(auth.email(), '')))
  with check (lower(rater_email) = lower(coalesce(auth.email(), '')));

-- ---------------------------------------------------------------------------
-- Live updates: follow other members' writes without reloading.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'news_board'
  ) then
    execute 'alter publication supabase_realtime add table public.news_board';
  end if;
end $$;

-- PostgREST caches the schema; without this the new tables answer 404 until the next
-- automatic reload.
notify pgrst, 'reload schema';

-- Check the work landed:
select table_name, row_level_security_enabled
from pg_tables
where schemaname = 'public' and table_name in ('news_board', 'news_assessments');
