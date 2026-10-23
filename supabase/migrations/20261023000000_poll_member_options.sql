-- Let the Layout Editor/Deputy open a poll so layout members can add their own option.
alter table public.polls
  add column if not exists allow_member_options boolean not null default false;

-- PostgREST caches the schema; without this reload the new column stays invisible to
-- the client until the next auto-reload.
select pg_notify('pgrst', 'reload schema');
