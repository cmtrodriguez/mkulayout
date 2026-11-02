alter table public.tasks
  add column if not exists task_kind text;
