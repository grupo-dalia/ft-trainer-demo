begin;
do $$
declare e uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
begin
 insert into public.exercises(id,name,body_group,primary_muscle,tracking_type,is_custom,media_type,media_url) values(e,'Prueba transaccional tiempo','Otros',null,'time',true,'youtube','https://youtu.be/abcdefghijk');
 update public.exercises set media_type='vimeo',media_url='https://vimeo.com/123456789/hash' where id=e;
 if not exists(select 1 from public.exercises where id=e and media_type='vimeo' and primary_muscle is null) then raise exception 'Edicion no conservada';end if;
 insert into public.clients(id,first_name,email,subscriber_number) values(c,'Prueba tiempo',c||'@example.invalid',-900018);
 insert into public.workout_sessions(id,client_id) values(s,c);
 insert into public.set_logs(session_id,exercise_id,set_number,duration_seconds,reps,weight_kg,completed) values(s,e,1,45,null,null,true);
 if not exists(select 1 from public.set_logs where session_id=s and duration_seconds=45 and reps is null and weight_kg is null) then raise exception 'Duracion no conservada';end if;
end $$;
select 'PASS: optional muscle, edit video, timed series' as result;
rollback;
