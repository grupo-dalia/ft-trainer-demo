-- Additive: existing assignments, sessions and set logs are preserved.
begin;
alter table public.routine_folders add column if not exists client_id uuid references public.clients(id) on delete cascade;
alter table public.routine_folders add column if not exists is_published boolean not null default false;
alter table public.routines drop constraint if exists routines_source_check;
alter table public.routines add constraint routines_source_check check(source in ('trainer','coach','client'));
create index if not exists routine_folders_client_idx on public.routine_folders(client_id);

create policy routine_folders_client_read on public.routine_folders for select to authenticated
using(public.owns_client(client_id) or (client_id is null and is_published));
create policy routines_general_read on public.routines for select to authenticated
using(client_id is null and exists(select 1 from public.routine_folders f where f.id=folder_id and f.client_id is null and f.is_published));
create policy routine_exercises_general_read on public.routine_exercises for select to authenticated
using(exists(select 1 from public.routines r join public.routine_folders f on f.id=r.folder_id where r.id=routine_id and r.client_id is null and f.client_id is null and f.is_published));

create or replace function public.ft_create_training(p_client uuid,p_name text,p_folder uuid default null,p_folder_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare folder uuid:=p_folder; result uuid;
begin
 if not public.owns_client(p_client) or not public.has_active_access(p_client) then raise exception 'Acceso no autorizado'; end if;
 if nullif(btrim(p_name),'') is null or length(p_name)>120 then raise exception 'Nombre no valido'; end if;
 if folder is not null and not exists(select 1 from public.routine_folders where id=folder and client_id=p_client) then raise exception 'Carpeta no autorizada'; end if;
 if folder is null then
  if nullif(btrim(p_folder_name),'') is null or length(p_folder_name)>120 then raise exception 'Nombre de carpeta no valido'; end if;
  insert into public.routine_folders(name,client_id,created_by) values(btrim(p_folder_name),p_client,auth.uid()) returning id into folder;
 end if;
 insert into public.routines(client_id,created_by,name,source,status,folder_id) values(p_client,auth.uid(),btrim(p_name),'client','active',folder) returning id into result;
 return result;
end $$;

create or replace function public.ft_copy_general_folder(p_client uuid,p_folder uuid,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_folder uuid; target_routine uuid; original record;
begin
 if not public.owns_client(p_client) or not public.has_active_access(p_client) then raise exception 'Acceso no autorizado'; end if;
 perform 1 from public.routine_folders where id=p_folder and client_id is null and is_published for share;
 if not found then raise exception 'Carpeta no publicada'; end if;
 if nullif(btrim(p_name),'') is null or length(p_name)>120 then raise exception 'Nombre no valido'; end if;
 if not exists(select 1 from public.routines where folder_id=p_folder and client_id is null) then raise exception 'Carpeta vacia'; end if;
 insert into public.routine_folders(name,client_id,created_by) values(btrim(p_name),p_client,auth.uid()) returning id into target_folder;
 for original in select * from public.routines where folder_id=p_folder and client_id is null order by created_at for share loop
  insert into public.routines(client_id,created_by,name,description,objective,source,status,folder_id)
  values(p_client,auth.uid(),original.name,original.description,original.objective,'client','active',target_folder) returning id into target_routine;
  insert into public.routine_exercises(routine_id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group)
  select target_routine,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,target_weight_kg,target_rir,rest_seconds,notes,superset_group from public.routine_exercises where routine_id=original.id;
 end loop;
 return target_folder;
end $$;

create or replace function public.ft_add_personal_exercise(p_routine uuid,p_exercise uuid,p_day integer,p_position integer,p_sets integer,p_min integer,p_max integer,p_rest integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare owner uuid; target_position integer; entry record; result uuid;
begin
 select client_id into owner from public.routines where id=p_routine and source='client' and created_by=auth.uid() for update;
 if owner is null or not public.owns_client(owner) or not public.has_active_access(owner) then raise exception 'Solo puedes editar tus entrenamientos'; end if;
 if p_day is null or p_day not between 1 and 14 or p_position is null or p_position<1 or p_sets is null or p_sets not between 1 and 20 or p_min is null or p_min not between 1 and 100 or p_max is null or p_max not between p_min and 100 or p_rest is null or p_rest not between 0 and 900 then raise exception 'Configuracion no valida'; end if;
 if not exists(select 1 from public.exercises where id=p_exercise and is_active) then raise exception 'Ejercicio no disponible'; end if;
 if exists(select 1 from public.routine_exercises where routine_id=p_routine and day_number=p_day and exercise_id=p_exercise) then raise exception 'Ejercicio ya incluido en este dia'; end if;
 select least(p_position,coalesce(max(position),0)+1) into target_position from public.routine_exercises where routine_id=p_routine and day_number=p_day;
 for entry in select id from public.routine_exercises where routine_id=p_routine and day_number=p_day and position>=target_position order by position desc loop
  update public.routine_exercises set position=position+1 where id=entry.id;
 end loop;
 insert into public.routine_exercises(routine_id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max,rest_seconds)
 values(p_routine,p_exercise,p_day,target_position,p_sets,p_min,p_max,p_rest) returning id into result;
 return result;
end $$;

create or replace function public.ft_publish_routine_folder(p_folder uuid,p_publish boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_trainer() then raise exception 'Solo el entrenador puede publicar'; end if;
 perform 1 from public.routine_folders where id=p_folder and client_id is null for update;
 if not found then raise exception 'No es una carpeta de plantillas'; end if;
 if p_publish and not exists(select 1 from public.routines where folder_id=p_folder and client_id is null) then raise exception 'Anade una rutina antes de publicar'; end if;
 update public.routine_folders set is_published=p_publish,updated_at=now() where id=p_folder;
end $$;

revoke all on function public.ft_create_training(uuid,text,uuid,text) from public,anon;
revoke all on function public.ft_copy_general_folder(uuid,uuid,text) from public,anon;
revoke all on function public.ft_add_personal_exercise(uuid,uuid,integer,integer,integer,integer,integer,integer) from public,anon;
revoke all on function public.ft_publish_routine_folder(uuid,boolean) from public,anon;
grant execute on function public.ft_create_training(uuid,text,uuid,text),public.ft_copy_general_folder(uuid,uuid,text),public.ft_add_personal_exercise(uuid,uuid,integer,integer,integer,integer,integer,integer),public.ft_publish_routine_folder(uuid,boolean) to authenticated;
commit;
