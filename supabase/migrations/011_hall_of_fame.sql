alter table public.clients
  add column if not exists hall_of_fame_enabled boolean not null default false,
  add column if not exists hall_of_fame_alias text;

grant update (hall_of_fame_enabled, hall_of_fame_alias) on public.clients to authenticated;

create or replace function public.hall_of_fame_leaderboard(
  p_exercise uuid default null,
  p_period text default 'month',
  p_mode text default 'absolute'
)
returns table (
  rank bigint,
  client_id uuid,
  alias text,
  exercise_id uuid,
  exercise_name text,
  weight_kg numeric,
  reps smallint,
  estimated_1rm numeric,
  relative_score numeric,
  achieved_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with valid_sets as (
    select
      ws.client_id, sl.exercise_id, e.name as exercise_name,
      sl.weight_kg, sl.reps, sl.created_at,
      round((sl.weight_kg * (1 + sl.reps::numeric / 30)), 2) as e1rm,
      (
        select m.weight_kg from public.measurements m
        where m.client_id = ws.client_id and m.recorded_on <= sl.created_at::date and m.weight_kg > 0
        order by m.recorded_on desc limit 1
      ) as body_weight
    from public.set_logs sl
    join public.workout_sessions ws on ws.id = sl.session_id
    join public.clients c on c.id = ws.client_id
    join public.exercises e on e.id = sl.exercise_id
    where auth.uid() is not null
      and c.hall_of_fame_enabled = true
      and sl.completed = true and sl.weight_kg > 0 and sl.reps between 1 and 20
      and (p_exercise is null or sl.exercise_id = p_exercise)
      and (p_period = 'all' or sl.created_at >= date_trunc('month', now()))
  ), personal_bests as (
    select distinct on (client_id, exercise_id)
      client_id, exercise_id, exercise_name, weight_kg, reps, created_at, e1rm,
      case when body_weight > 0 then round(e1rm / body_weight, 3) end as relative
    from valid_sets
    order by client_id, exercise_id,
      case when p_mode = 'relative' then e1rm / nullif(body_weight, 0) else e1rm end desc nulls last,
      created_at asc
  )
  select
    dense_rank() over (order by case when p_mode = 'relative' then pb.relative else pb.e1rm end desc nulls last),
    pb.client_id,
    coalesce(nullif(btrim(c.hall_of_fame_alias), ''), 'Atleta FT') as alias,
    pb.exercise_id, pb.exercise_name, pb.weight_kg, pb.reps, pb.e1rm,
    pb.relative, pb.created_at
  from personal_bests pb join public.clients c on c.id = pb.client_id
  where p_mode <> 'relative' or pb.relative is not null
  order by 1, pb.created_at asc
  limit 50;
$$;

grant execute on function public.hall_of_fame_leaderboard(uuid,text,text) to authenticated;
