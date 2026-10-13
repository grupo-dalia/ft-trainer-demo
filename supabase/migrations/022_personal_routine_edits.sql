begin;
create or replace function public.ft_set_personal_series(p_entry uuid,p_sets integer)
returns void language plpgsql security definer set search_path=public as $$
declare r public.routines%rowtype; e public.routine_exercises%rowtype;
begin
select * into e from public.routine_exercises where id=p_entry for update;
if not found then raise exception 'Ejercicio no encontrado'; end if;
select * into r from public.routines where id=e.routine_id for update;
if r.source<>'client' or r.created_by is distinct from auth.uid() or not public.owns_client(r.client_id) or not public.has_active_access(r.client_id) then raise exception 'Rutina protegida'; end if;
if p_sets is null or p_sets not between 1 and 20 then raise exception 'Series no validas'; end if;
update public.routine_exercises set target_sets=p_sets where id=p_entry;
end $$;
create or replace function public.ft_remove_personal_exercise(p_entry uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.routines%rowtype; e public.routine_exercises%rowtype;
begin
select * into e from public.routine_exercises where id=p_entry for update;
if not found then raise exception 'Ejercicio no encontrado'; end if;
select * into r from public.routines where id=e.routine_id for update;
if r.source<>'client' or r.created_by is distinct from auth.uid() or not public.owns_client(r.client_id) or not public.has_active_access(r.client_id) then raise exception 'Rutina protegida'; end if;
delete from public.routine_exercises where id=p_entry;
end $$;
revoke all on function public.ft_set_personal_series(uuid,integer),public.ft_remove_personal_exercise(uuid) from public,anon;
grant execute on function public.ft_set_personal_series(uuid,integer),public.ft_remove_personal_exercise(uuid) to authenticated;
commit;
