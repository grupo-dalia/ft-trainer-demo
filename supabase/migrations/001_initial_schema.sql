create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'client' check (role in ('trainer','client')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text not null,
  phone text,
  birth_date date,
  height_cm numeric(5,2),
  objective text,
  experience_level text,
  injuries text,
  notes text,
  access_status text not null default 'pending' check (access_status in ('pending','active','paused')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_email_unique on public.clients (lower(email));

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  body_group text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  equipment text,
  difficulty text,
  instructions text,
  media_type text check (media_type in ('image','gif','video','youtube')),
  media_url text,
  thumbnail_url text,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  objective text,
  source text not null default 'trainer' check (source in ('trainer','coach')),
  week_start date,
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  coach_reasoning jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  day_number smallint not null default 1,
  position smallint not null,
  target_sets smallint not null,
  target_reps_min smallint,
  target_reps_max smallint,
  target_weight_kg numeric(7,2),
  target_rir smallint,
  rest_seconds smallint,
  notes text,
  unique (routine_id, day_number, position)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  day_number smallint,
  planned_for date,
  started_at timestamptz,
  completed_at timestamptz,
  duration_minutes smallint,
  perceived_effort smallint check (perceived_effort between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  routine_exercise_id uuid references public.routine_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id),
  set_number smallint not null,
  reps smallint,
  weight_kg numeric(7,2),
  rir smallint,
  pain_level smallint check (pain_level between 0 and 10),
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, exercise_id, set_number)
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  recorded_on date not null default current_date,
  weight_kg numeric(6,2),
  height_cm numeric(5,2),
  body_fat_pct numeric(5,2),
  waist_cm numeric(5,2),
  hip_cm numeric(5,2),
  chest_cm numeric(5,2),
  arm_cm numeric(5,2),
  thigh_cm numeric(5,2),
  notes text,
  created_at timestamptz not null default now(),
  unique (client_id, recorded_on)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount_eur numeric(7,2) not null,
  paid_on date not null default current_date,
  period_start date,
  period_end date,
  method text not null default 'cash' check (method = 'cash'),
  recorded_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  source text not null check (source in ('csv','excel','google_sheets')),
  source_name text,
  column_mapping jsonb not null default '{}'::jsonb,
  imported_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.is_trainer()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer'); $$;

create or replace function public.owns_client(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.clients where id = target and user_id = auth.uid()); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name','')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.exercises enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.measurements enable row level security;
alter table public.payments enable row level security;
alter table public.import_batches enable row level security;

create policy profiles_own_read on public.profiles for select using (id = auth.uid() or public.is_trainer());
create policy profiles_trainer_manage on public.profiles for all using (public.is_trainer()) with check (public.is_trainer());
create policy clients_own_read on public.clients for select using (user_id = auth.uid() or public.is_trainer());
create policy clients_trainer_manage on public.clients for all using (public.is_trainer()) with check (public.is_trainer());
create policy exercises_active_read on public.exercises for select using (is_active and auth.uid() is not null);
create policy exercises_trainer_manage on public.exercises for all using (public.is_trainer()) with check (public.is_trainer());
create policy routines_read on public.routines for select using (public.is_trainer() or public.owns_client(client_id));
create policy routines_trainer_manage on public.routines for all using (public.is_trainer()) with check (public.is_trainer());
create policy routine_exercises_read on public.routine_exercises for select using (public.is_trainer() or exists (select 1 from public.routines r where r.id = routine_id and public.owns_client(r.client_id)));
create policy routine_exercises_trainer_manage on public.routine_exercises for all using (public.is_trainer()) with check (public.is_trainer());
create policy sessions_read on public.workout_sessions for select using (public.is_trainer() or public.owns_client(client_id));
create policy sessions_client_insert on public.workout_sessions for insert with check (public.owns_client(client_id) or public.is_trainer());
create policy sessions_client_update on public.workout_sessions for update using (public.owns_client(client_id) or public.is_trainer()) with check (public.owns_client(client_id) or public.is_trainer());
create policy sets_read on public.set_logs for select using (public.is_trainer() or exists (select 1 from public.workout_sessions s where s.id = session_id and public.owns_client(s.client_id)));
create policy sets_client_write on public.set_logs for all using (public.is_trainer() or exists (select 1 from public.workout_sessions s where s.id = session_id and public.owns_client(s.client_id))) with check (public.is_trainer() or exists (select 1 from public.workout_sessions s where s.id = session_id and public.owns_client(s.client_id)));
create policy measurements_read on public.measurements for select using (public.is_trainer() or public.owns_client(client_id));
create policy measurements_write on public.measurements for all using (public.is_trainer() or public.owns_client(client_id)) with check (public.is_trainer() or public.owns_client(client_id));
create policy payments_read on public.payments for select using (public.is_trainer() or public.owns_client(client_id));
create policy payments_trainer_manage on public.payments for all using (public.is_trainer()) with check (public.is_trainer());
create policy imports_trainer_manage on public.import_batches for all using (public.is_trainer()) with check (public.is_trainer());

create index routines_client_idx on public.routines(client_id, week_start desc);
create index sessions_client_idx on public.workout_sessions(client_id, planned_for desc);
create index set_logs_session_idx on public.set_logs(session_id);
create index measurements_client_idx on public.measurements(client_id, recorded_on desc);

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.clients, public.exercises, public.routines,
  public.routine_exercises, public.workout_sessions, public.set_logs,
  public.measurements, public.payments to authenticated;
grant insert, update on public.workout_sessions, public.set_logs, public.measurements to authenticated;
grant insert, update, delete on public.profiles, public.clients, public.exercises,
  public.routines, public.routine_exercises, public.workout_sessions, public.set_logs,
  public.measurements, public.payments, public.import_batches to authenticated;
grant select on public.import_batches to authenticated;
grant execute on function public.is_trainer() to authenticated;
grant execute on function public.owns_client(uuid) to authenticated;
