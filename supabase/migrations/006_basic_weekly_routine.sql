-- Plantilla inicial de producto: FT · Básica semanal.
-- Es una plantilla reutilizable; el entrenador la asigna al cliente desde Rutinas.
do $$
declare
  v_routine uuid;
  v_exercise uuid;
  v_names text[] := array['Press de banca con barra','Press militar con mancuernas','Sentadilla goblet','Remo con mancuerna','Curl de bíceps con mancuernas'];
  v_groups text[] := array['Pecho','Hombro','Pierna','Espalda','Brazo'];
  v_muscles text[] := array['Pectoral','Deltoides','Cuádriceps','Dorsal','Bíceps'];
  i integer;
begin
  if exists (select 1 from public.routines where client_id is null and name = 'Básica semanal') then
    return;
  end if;

  insert into public.routines (client_id, name, description, source, status)
  values (null, 'Básica semanal', 'Entrenamiento de lunes a viernes: pecho, hombro, pierna, espalda y brazo.', 'trainer', 'draft')
  returning id into v_routine;

  for i in 1..5 loop
    select id into v_exercise from public.exercises where lower(name) = lower(v_names[i]) limit 1;
    if v_exercise is null then
      insert into public.exercises (name, body_group, primary_muscle, is_custom, is_active)
      values (v_names[i], v_groups[i], v_muscles[i], false, true)
      returning id into v_exercise;
    end if;
    insert into public.routine_exercises (routine_id, exercise_id, day_number, position, target_sets, target_reps_min, target_reps_max, target_rir, rest_seconds)
    values (v_routine, v_exercise, i, 1, 3, 8, 12, 2, 90);
    v_exercise := null;
  end loop;
end $$;
