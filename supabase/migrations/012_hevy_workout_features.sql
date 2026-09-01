alter table public.set_logs
  add column if not exists set_type text not null default 'normal'
  check (set_type in ('warmup','normal','drop','failure'));

alter table public.routine_exercises
  add column if not exists superset_group smallint;

alter table public.clients
  add column if not exists profile_visibility text not null default 'private'
  check (profile_visibility in ('private','gym'));

create index if not exists set_logs_exercise_created_idx
  on public.set_logs(exercise_id, created_at desc);

drop policy if exists exercises_client_create on public.exercises;
create policy exercises_client_create on public.exercises for insert
  with check (created_by = auth.uid() and is_custom = true);

drop policy if exists exercises_client_update_own on public.exercises;
create policy exercises_client_update_own on public.exercises for update
  using (created_by = auth.uid() and is_custom = true)
  with check (created_by = auth.uid() and is_custom = true);
