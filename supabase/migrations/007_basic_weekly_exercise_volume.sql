-- Completa la plantilla inicial con una sesión útil: 4 ejercicios por día.
do $$
declare
  r uuid;
  e uuid;
  i integer;
  j integer;
  names text[][] := array[
    array['Press de banca con barra','Press inclinado con mancuernas','Aperturas en máquina','Fondos asistidos'],
    array['Press militar con mancuernas','Elevaciones laterales','Pájaros con mancuernas','Face pull'],
    array['Sentadilla goblet','Prensa de piernas','Curl femoral','Extensión de cuádriceps'],
    array['Remo con mancuerna','Jalón al pecho','Remo sentado en polea','Pullover en polea'],
    array['Curl de bíceps con mancuernas','Curl martillo','Extensión de tríceps en polea','Press francés']
  ];
  groups text[] := array['Pecho','Hombro','Pierna','Espalda','Brazo'];
begin
  select id into r from public.routines where client_id is null and name = 'Básica semanal' limit 1;
  if r is null then return; end if;
  for i in 1..5 loop
    for j in 1..4 loop
      select id into e from public.exercises where lower(name)=lower(names[i][j]) limit 1;
      if e is null then
        insert into public.exercises(name,body_group,primary_muscle,is_active) values(names[i][j],groups[i],groups[i],true) returning id into e;
      end if;
      if not exists(select 1 from public.routine_exercises where routine_id=r and day_number=i and position=j) then
        insert into public.routine_exercises(routine_id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_rir,rest_seconds)
        values(r,e,i,j,3,8,12,2,90);
      end if;
      e := null;
    end loop;
  end loop;
end $$;
