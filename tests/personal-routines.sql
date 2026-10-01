-- Run inside a transaction after migration 016, then ROLLBACK.
do $$
declare
 u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); trainer uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); other_client uuid:=gen_random_uuid(); f uuid:=gen_random_uuid();
 ex uuid:=gen_random_uuid(); template uuid:=gen_random_uuid(); r uuid; copied uuid; duplicate_copy uuid; added uuid;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid'),(other_user,other_user||'@example.invalid'),(trainer,trainer||'@example.invalid');
 insert into public.profiles(id,role) values(trainer,'trainer') on conflict(id) do update set role='trainer';
 insert into public.clients(id,user_id,first_name,email,access_status,subscriber_number)
 values(c,u,'Prueba transaccional',u||'@example.invalid','active',-900001),(other_client,other_user,'Otro cliente',other_user||'@example.invalid','active',-900002);
 insert into public.exercises(id,name,body_group,primary_muscle) values(ex,'Ejercicio transaccional','Pecho','Pectoral');
 insert into public.routine_folders(id,name) values(f,'Programa de prueba');
 insert into public.routines(id,name,folder_id,client_id,source) values(template,'Torso',f,null,'trainer');
 insert into public.routine_exercises(routine_id,exercise_id,day_number,position,target_sets,target_reps_min,target_reps_max)
 values(template,ex,1,1,3,8,12);
 perform set_config('request.jwt.claim.sub',trainer::text,true);
 perform public.ft_publish_routine_folder(f,true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 r:=public.ft_create_training(c,'Entreno propio',null,'Septiembre');
 added:=public.ft_add_personal_exercise(r,ex,2,1,4,6,10,0);
 if not exists(select 1 from public.routine_exercises where id=added and target_sets=4 and rest_seconds=0 and day_number=2) then raise exception 'Configuracion no conservada'; end if;
 copied:=public.ft_copy_general_folder(c,f,'Octubre');
 duplicate_copy:=public.ft_copy_general_folder(c,f,'Octubre version 2');
 if copied=duplicate_copy or not exists(select 1 from public.routines where id=r) then raise exception 'Copia sobrescribe datos'; end if;
 if (select count(*) from public.routine_exercises re join public.routines rr on rr.id=re.routine_id where rr.folder_id=copied)<>1 then raise exception 'Ejercicios no copiados'; end if;
 begin
  perform public.ft_create_training(other_client,'No permitido',null,'Privado');
  raise exception 'Se permitio escribir en otro cliente';
 exception when others then if sqlerrm='Se permitio escribir en otro cliente' then raise; end if; end;
 begin
  perform public.ft_publish_routine_folder(f,false);
  raise exception 'El cliente pudo publicar';
 exception when others then if sqlerrm='El cliente pudo publicar' then raise; end if; end;
 begin
  perform public.ft_add_personal_exercise(template,ex,1,2,3,8,12,60);
  raise exception 'El cliente pudo modificar la plantilla';
 exception when others then if sqlerrm='El cliente pudo modificar la plantilla' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',trainer::text,true);
 perform public.ft_publish_routine_folder(f,false);
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin
  perform public.ft_copy_general_folder(c,f,'No publicado');
  raise exception 'Se copio carpeta no publicada';
 exception when others then if sqlerrm='Se copio carpeta no publicada' then raise; end if; end;
end $$;
select 'PASS: create, add, independent copies, ownership, publication and template protection' as result;
