begin;
alter table public.routines add column if not exists is_published boolean not null default false;
-- Preserve programs that were already published through their folder.
update public.routines r set is_published=true where r.client_id is null and exists(select 1 from public.routine_folders f where f.id=r.folder_id and f.client_id is null and f.is_published);
drop policy if exists routines_general_read on public.routines;
create policy routines_general_read on public.routines for select to authenticated using(client_id is null and is_published);
drop policy if exists routine_exercises_general_read on public.routine_exercises;
create policy routine_exercises_general_read on public.routine_exercises for select to authenticated using(exists(select 1 from public.routines r where r.id=routine_id and r.client_id is null and r.is_published));
create or replace function public.ft_publish_routines(p_ids uuid[],p_publish boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
if not public.is_trainer() then raise exception 'Solo el administrador puede publicar'; end if;
if p_ids is null or p_publish is null then raise exception 'Seleccion no valida'; end if;
if exists(select 1 from unnest(p_ids) x(id) where not exists(select 1 from public.routines r where r.id=x.id and r.client_id is null)) then raise exception 'Solo plantillas'; end if;
update public.routines set is_published=p_publish where id=any(p_ids) and client_id is null;
end $$;
create or replace function public.ft_publish_routine_folder(p_folder uuid,p_publish boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
if not public.is_trainer() then raise exception 'Solo el administrador puede publicar'; end if;
perform 1 from public.routine_folders where id=p_folder and client_id is null for update;
if not found or p_publish is null then raise exception 'Carpeta no valida'; end if;
update public.routine_folders set is_published=p_publish,updated_at=now() where id=p_folder;
update public.routines set is_published=p_publish where folder_id=p_folder and client_id is null;
end $$;
create or replace function public.ft_copy_general_folder(p_client uuid,p_folder uuid,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_folder uuid; target_routine uuid; original record;
begin
 if not public.owns_client(p_client) or not public.has_active_access(p_client) then raise exception 'Acceso no autorizado'; end if;
 perform 1 from public.routine_folders where id=p_folder and client_id is null and is_published for share;
 if not found then raise exception 'Carpeta no publicada'; end if;
 if nullif(btrim(p_name),'') is null or length(p_name)>120 then raise exception 'Nombre no valido'; end if;
 if not exists(select 1 from public.routines where folder_id=p_folder and client_id is null and is_published) then raise exception 'Carpeta vacia'; end if;
 insert into public.routine_folders(name,client_id,created_by) values(btrim(p_name),p_client,auth.uid()) returning id into target_folder;
 for original in select * from public.routines where folder_id=p_folder and client_id is null and is_published order by created_at for share loop
  insert into public.routines(client_id,created_by,name,description,objective,source,status,folder_id)
  values(p_client,auth.uid(),original.name,original.description,original.objective,'client','active',target_folder) returning id into target_routine;
  insert into public.routine_exercises(routine_id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group)
  select target_routine,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group from public.routine_exercises where routine_id=original.id;
 end loop;
 return target_folder;
end $$;

create or replace function public.ft_copy_general_routine(p_client uuid,p_routine uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare original public.routines%rowtype; target_routine uuid; target_folder uuid;
begin
if not public.owns_client(p_client) or not public.has_active_access(p_client) then raise exception 'Acceso no autorizado'; end if;
select * into original from public.routines where id=p_routine and client_id is null and is_published for share;
if not found then raise exception 'Rutina privada'; end if;
insert into public.routine_folders(name,client_id,created_by) values(original.name,p_client,auth.uid()) returning id into target_folder;
insert into public.routines(client_id,created_by,name,description,objective,source,status,folder_id) values(p_client,auth.uid(),original.name,original.description,original.objective,'client','active',target_folder) returning id into target_routine;
insert into public.routine_exercises(routine_id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group)
select target_routine,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group from public.routine_exercises where routine_id=original.id;
return target_routine;
end $$;
revoke all on function public.ft_publish_routines(uuid[],boolean),public.ft_copy_general_routine(uuid,uuid) from public,anon;
grant execute on function public.ft_publish_routines(uuid[],boolean),public.ft_copy_general_routine(uuid,uuid) to authenticated;
commit;
