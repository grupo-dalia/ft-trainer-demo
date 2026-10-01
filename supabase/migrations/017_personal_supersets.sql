begin;

create or replace function public.ft_set_personal_supersets(p_routine uuid, p_day integer, p_groups jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare owner uuid; entry jsonb; exercise_row public.routine_exercises%rowtype;
begin
  select client_id into owner from public.routines
    where id=p_routine and source='client' and created_by=auth.uid() for update;
  if owner is null or not public.owns_client(owner) or not public.has_active_access(owner) then
    raise exception 'Solo puedes editar tus entrenamientos';
  end if;
  if p_day is null or p_day not between 1 and 14 or p_groups is null or jsonb_typeof(p_groups) <> 'array' then
    raise exception 'Superserie no valida';
  end if;
  if jsonb_array_length(p_groups) <> (select count(*) from public.routine_exercises where routine_id=p_routine and day_number=p_day) then
    raise exception 'La lista de ejercicios ha cambiado';
  end if;
  for entry in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(entry) <> 'object' or nullif(entry->>'id','') is null or
       (entry->>'group' is not null and ((entry->>'group') !~ '^[1-9][0-9]*$' or (entry->>'group')::integer > 32767)) then
      raise exception 'Superserie no valida';
    end if;
    select * into exercise_row from public.routine_exercises
      where id=(entry->>'id')::uuid and routine_id=p_routine and day_number=p_day for update;
    if not found then raise exception 'Ejercicio no autorizado'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_groups)) <> jsonb_array_length(p_groups) then
    raise exception 'Ejercicio duplicado';
  end if;
  if exists (select 1 from jsonb_array_elements(p_groups) as groups(entry)
    where groups.entry->>'group' is not null
    group by groups.entry->>'group' having count(*) < 2) then
    raise exception 'Una superserie necesita dos ejercicios';
  end if;
  update public.routine_exercises re set superset_group=(groups.entry->>'group')::smallint
    from jsonb_array_elements(p_groups) as groups(entry)
    where re.id=(groups.entry->>'id')::uuid and re.routine_id=p_routine and re.day_number=p_day;
end $$;

revoke all on function public.ft_set_personal_supersets(uuid,integer,jsonb) from public,anon;
grant execute on function public.ft_set_personal_supersets(uuid,integer,jsonb) to authenticated;

commit;
