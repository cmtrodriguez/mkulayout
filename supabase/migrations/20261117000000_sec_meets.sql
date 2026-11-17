-- ====================================================================
-- SecMeets (Section Meetings) — schema, row level security, realtime, seeds
--
-- Run this whole file as ONE paste in Dashboard -> SQL Editor. It contains no
-- reporting queries on purpose: the editor submits a paste as a single
-- transaction, so a trailing select that fails would roll the tables back.
-- Verification queries live at the bottom, commented out, and belong in a
-- separate run.
-- ====================================================================

-- --------------------------------------------------------------------
-- Role helpers
--
-- The policies have to tell the Layout Editor from the Layout Deputy from
-- everybody else, and the only identity the database gets is the signed-in
-- email. Both role columns are checked because a member may exist only in the
-- directory or only in profiles.
-- --------------------------------------------------------------------

-- The canonical address of the session. The app signs the Editor in under two
-- aliases (see normalizeEmail in src/types.ts) but stores their rows under the
-- up.edu.ph address, so the policies have to fold the aliases the same way or
-- the Editor would be locked out of their own progress rows.
create or replace function public.secmeet_email()
returns text
language sql
stable
set search_path = public
as $$
  select case
    when lower(auth.jwt()->>'email') in ('rxtiannn@gmail.com', 'mkulayout.upm@gmail.com')
      then 'ctrodriguez2@up.edu.ph'
    else lower(coalesce(auth.jwt()->>'email', ''))
  end;
$$;

comment on function public.secmeet_email() is
  'Canonical email of the signed-in layout member, with the Editor''s sign-in aliases folded onto their official address.';

create or replace function public.secmeet_role()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select m.role from public.members m
      where m.email is not null and lower(m.email) = public.secmeet_email()
      limit 1),
    (select p.role from public.profiles p where p.id = auth.uid() limit 1),
    ''
  );
$$;

comment on function public.secmeet_role() is
  'Role of the signed-in layout member, resolved from the email in the JWT. Empty when nobody is signed in.';

-- Meeting tabs, their agenda items and the async task list are the Layout
-- Editor's alone.
create or replace function public.is_secmeet_editor()
returns boolean
language sql
stable
set search_path = public
as $$ select public.secmeet_role() = 'Layout Editor' $$;

-- Attendance and minutes are shared between the Layout Editor and the Deputy,
-- and the same pair sees every member's async progress.
create or replace function public.is_secmeet_lead()
returns boolean
language sql
stable
set search_path = public
as $$ select public.secmeet_role() in ('Layout Editor', 'Layout Deputy') $$;

-- --------------------------------------------------------------------
-- 1. Meetings
-- --------------------------------------------------------------------
create table if not exists public.sec_meets (
  id uuid primary key default gen_random_uuid(),
  seq integer not null unique,
  title text not null,
  kind text not null default 'synchronous' check (kind in ('synchronous', 'asynchronous')),
  status text not null default 'Not Started' check (status in ('Not Started', 'In Progress', 'Completed')),
  meeting_date text,
  details text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- --------------------------------------------------------------------
-- 2. Agenda items (synchronous) and tasks (asynchronous)
--    One table because both are an ordered list of lines the Editor owns;
--    item_kind separates a plain checkbox task from the Dispo Check, whose
--    per-member answer is a four-category table rather than a tick.
-- --------------------------------------------------------------------
create table if not exists public.sec_meet_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.sec_meets(id) on delete cascade not null,
  kind text not null check (kind in ('agenda', 'task')),
  item_kind text not null default 'checklist' check (item_kind in ('checklist', 'dispo')),
  position integer not null default 0,
  title text not null,
  notes text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists sec_meet_items_meeting_idx
  on public.sec_meet_items (meeting_id, kind, position);

-- --------------------------------------------------------------------
-- 3. Attendance — one row per member per synchronous meeting.
--    Four states, not a checkbox: the official minutes template records
--    P / L / E / A, and a boolean cannot produce "late" or "excused".
-- --------------------------------------------------------------------
create table if not exists public.sec_meet_attendance (
  meeting_id uuid references public.sec_meets(id) on delete cascade not null,
  member_email text not null,
  status text not null check (status in ('P', 'L', 'E', 'A')),
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  primary key (meeting_id, member_email)
);

-- --------------------------------------------------------------------
-- 4. Minutes — one document per synchronous meeting, line breaks preserved
-- --------------------------------------------------------------------
create table if not exists public.sec_meet_minutes (
  meeting_id uuid primary key references public.sec_meets(id) on delete cascade,
  minutes text not null default '',
  updated_by text,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- --------------------------------------------------------------------
-- 5. Async progress — one row per member per task.
--    This is the private table: a member reads and writes only their own
--    rows, so another member's completion status or Dispo Check answers are
--    unreachable through the API as well as through the interface.
-- --------------------------------------------------------------------
create table if not exists public.sec_meet_progress (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.sec_meet_items(id) on delete cascade not null,
  meeting_id uuid references public.sec_meets(id) on delete cascade not null,
  member_email text not null,
  done boolean not null default false,
  dispo jsonb,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  unique (item_id, member_email)
);

create index if not exists sec_meet_progress_meeting_idx
  on public.sec_meet_progress (meeting_id);

-- ====================================================================
-- ROW LEVEL SECURITY
-- ====================================================================

alter table public.sec_meets enable row level security;
alter table public.sec_meet_items enable row level security;
alter table public.sec_meet_attendance enable row level security;
alter table public.sec_meet_minutes enable row level security;
alter table public.sec_meet_progress enable row level security;

-- Meetings: every layout member sees every tab; only the Editor creates,
-- edits or removes one.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sec_meets' and policyname = 'Allow authenticated read sec_meets') then
    create policy "Allow authenticated read sec_meets" on public.sec_meets for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meets' and policyname = 'Allow layout editor to manage sec_meets') then
    create policy "Allow layout editor to manage sec_meets" on public.sec_meets for all to authenticated
      using (public.is_secmeet_editor()) with check (public.is_secmeet_editor());
  end if;
end $$;

-- Agenda items and async tasks: readable by all, writable by the Editor only.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_items' and policyname = 'Allow authenticated read sec_meet_items') then
    create policy "Allow authenticated read sec_meet_items" on public.sec_meet_items for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_items' and policyname = 'Allow layout editor to manage sec_meet_items') then
    create policy "Allow layout editor to manage sec_meet_items" on public.sec_meet_items for all to authenticated
      using (public.is_secmeet_editor()) with check (public.is_secmeet_editor());
  end if;
end $$;

-- Attendance: everyone can see who came; only the Editor and Deputy mark it.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_attendance' and policyname = 'Allow authenticated read sec_meet_attendance') then
    create policy "Allow authenticated read sec_meet_attendance" on public.sec_meet_attendance for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_attendance' and policyname = 'Allow leads to manage sec_meet_attendance') then
    create policy "Allow leads to manage sec_meet_attendance" on public.sec_meet_attendance for all to authenticated
      using (public.is_secmeet_lead()) with check (public.is_secmeet_lead());
  end if;
end $$;

-- Minutes: everyone can read them; only the Editor and Deputy write them.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_minutes' and policyname = 'Allow authenticated read sec_meet_minutes') then
    create policy "Allow authenticated read sec_meet_minutes" on public.sec_meet_minutes for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_minutes' and policyname = 'Allow leads to manage sec_meet_minutes') then
    create policy "Allow leads to manage sec_meet_minutes" on public.sec_meet_minutes for all to authenticated
      using (public.is_secmeet_lead()) with check (public.is_secmeet_lead());
  end if;
end $$;

-- Async progress: own rows, or every row for the Editor and Deputy. There is
-- deliberately no policy that lets one member read another member's row.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_progress' and policyname = 'Allow member own or lead all sec_meet_progress') then
    create policy "Allow member own or lead all sec_meet_progress" on public.sec_meet_progress for select to authenticated
      using (
        lower(member_email) = public.secmeet_email()
        or public.is_secmeet_lead()
      );
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_progress' and policyname = 'Allow member insert own sec_meet_progress') then
    create policy "Allow member insert own sec_meet_progress" on public.sec_meet_progress for insert to authenticated
      with check (lower(member_email) = public.secmeet_email());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_progress' and policyname = 'Allow member update own sec_meet_progress') then
    create policy "Allow member update own sec_meet_progress" on public.sec_meet_progress for update to authenticated
      using (lower(member_email) = public.secmeet_email())
      with check (lower(member_email) = public.secmeet_email());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sec_meet_progress' and policyname = 'Allow member delete own sec_meet_progress') then
    create policy "Allow member delete own sec_meet_progress" on public.sec_meet_progress for delete to authenticated
      using (lower(member_email) = public.secmeet_email());
  end if;
end $$;

-- ====================================================================
-- REALTIME
-- sec_meet_progress is left out on purpose: a broadcast payload would carry
-- one member's Dispo Check answers to everybody on the channel, which is
-- exactly what the policies above forbid. The monitoring view reads it on
-- demand instead.
-- ====================================================================

do $$ begin
  alter publication supabase_realtime add table public.sec_meets;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.sec_meet_items;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.sec_meet_attendance;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.sec_meet_minutes;
exception when others then null;
end $$;

-- ====================================================================
-- PRECONFIGURED MEETINGS
-- Seeded here rather than on first load because the insert policy only lets
-- the Layout Editor write these tables; a browser-side seed would fail for
-- every other member. Every statement is guarded so re-running is safe.
--
-- The First Section Meeting is deliberately empty: no invented attendance,
-- agenda, minutes or date.
-- ====================================================================

insert into public.sec_meets (seq, title, kind, status)
select 1, 'First Section Meeting', 'synchronous', 'Completed'
where not exists (select 1 from public.sec_meets where seq = 1);

insert into public.sec_meets (seq, title, kind, status)
select 2, 'Second Section Meeting', 'asynchronous', 'Not Started'
where not exists (select 1 from public.sec_meets where seq = 2);

insert into public.sec_meet_items (meeting_id, kind, item_kind, position, title)
select m.id, 'task', 'dispo', 1, 'Dispo Check'
from public.sec_meets m
where m.seq = 2
  and not exists (
    select 1 from public.sec_meet_items i
    where i.meeting_id = m.id and lower(i.title) = 'dispo check'
  );

insert into public.sec_meet_items (meeting_id, kind, item_kind, position, title)
select m.id, 'task', 'checklist', 2, '1k6 Issue Assessment'
from public.sec_meets m
where m.seq = 2
  and not exists (
    select 1 from public.sec_meet_items i
    where i.meeting_id = m.id and lower(i.title) = '1k6 issue assessment'
  );

insert into public.sec_meet_items (meeting_id, kind, item_kind, position, title)
select m.id, 'task', 'checklist', 3, 'Read the InDesign Guidelines'
from public.sec_meets m
where m.seq = 2
  and not exists (
    select 1 from public.sec_meet_items i
    where i.meeting_id = m.id and lower(i.title) = 'read the indesign guidelines'
  );

insert into public.sec_meet_items (meeting_id, kind, item_kind, position, title)
select m.id, 'task', 'checklist', 4, 'Read the Online Layout Guidelines'
from public.sec_meets m
where m.seq = 2
  and not exists (
    select 1 from public.sec_meet_items i
    where i.meeting_id = m.id and lower(i.title) = 'read the online layout guidelines'
  );

-- PostgREST caches the schema; without this reload the new tables answer
-- PGRST205 until the cache expires.
select pg_notify('pgrst', 'reload schema');

-- ====================================================================
-- STOP — everything below is a report. Run it in a SEPARATE SQL Editor query.
-- ====================================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'sec_meet%' order by tablename;
-- select seq, title, kind, status from public.sec_meets order by seq;
-- select i.position, i.title, i.item_kind from public.sec_meet_items i
--   join public.sec_meets m on m.id = i.meeting_id
--   where m.seq = 2 order by i.position;
-- select public.secmeet_role();
-- select public.secmeet_email();
