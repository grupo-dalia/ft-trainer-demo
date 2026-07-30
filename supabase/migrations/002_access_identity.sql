-- FT Trainer: solicitudes, unión de identidades y autorización manual.
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  matched_client_id uuid references public.clients(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text not null,
  phone text,
  source text not null default 'web' check (source in ('web','google','recovery','admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_review')),
  conflict_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists access_requests_email_unique on public.access_requests (lower(email));
create index if not exists access_requests_status_idx on public.access_requests(status,created_at desc);
alter table public.access_requests enable row level security;

create or replace function public.has_active_access(target uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.clients where id=target and user_id=auth.uid() and access_status='active'); $$;

create or replace function public.submit_access_request(
  p_first_name text,p_last_name text,p_email text,p_phone text default null,p_source text default 'web'
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid; v_email text:=lower(trim(p_email)); v_client public.clients%rowtype;
begin
  if length(trim(p_first_name))<2 or position('@' in v_email)<2 then raise exception 'invalid_request'; end if;
  select * into v_client from public.clients where lower(email)=v_email limit 1;
  insert into public.access_requests(user_id,matched_client_id,first_name,last_name,email,phone,source,status,conflict_reason)
  values(auth.uid(),v_client.id,trim(p_first_name),trim(coalesce(p_last_name,'')),v_email,nullif(trim(coalesce(p_phone,'')),''),
    case when p_source in ('web','google','recovery','admin') then p_source else 'web' end,
    case when v_client.user_id is not null and v_client.user_id<>auth.uid() then 'needs_review' else 'pending' end,
    case when v_client.user_id is not null and v_client.user_id<>auth.uid() then 'El cliente ya está unido a otra cuenta' end)
  on conflict ((lower(email))) do update set
    user_id=coalesce(access_requests.user_id,excluded.user_id),matched_client_id=coalesce(access_requests.matched_client_id,excluded.matched_client_id),
    first_name=excluded.first_name,last_name=excluded.last_name,phone=coalesce(excluded.phone,access_requests.phone),source=excluded.source,
    status=case when access_requests.status='approved' then 'approved' else excluded.status end,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare v_email text:=lower(coalesce(new.email,'')); v_client_id uuid; v_client_user uuid;
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'display_name',''))
  on conflict(id) do update set display_name=coalesce(nullif(excluded.display_name,''),profiles.display_name);
  select id,user_id into v_client_id,v_client_user from public.clients where lower(email)=v_email limit 1;
  if v_client_id is not null and v_client_user is null then update public.clients set user_id=new.id,updated_at=now() where id=v_client_id; end if;
  perform public.submit_access_request(
    coalesce(nullif(new.raw_user_meta_data->>'given_name',''),nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name',''), ' ',1),''),'Nuevo cliente'),
    coalesce(new.raw_user_meta_data->>'family_name',''),v_email,new.raw_user_meta_data->>'phone',
    case when new.raw_app_meta_data->>'provider'='google' then 'google' else 'web' end);
  return new;
end $$;

create or replace function public.approve_access_request(p_request_id uuid,p_client_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare r public.access_requests%rowtype; v_client_id uuid; v_existing_user uuid;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  select * into r from public.access_requests where id=p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  v_client_id:=coalesce(p_client_id,r.matched_client_id);
  if v_client_id is null then
    select id into v_client_id from public.clients where lower(email)=lower(r.email) limit 1;
  end if;
  if v_client_id is null then
    insert into public.clients(user_id,created_by,first_name,last_name,email,phone,access_status,activated_at)
    values(r.user_id,auth.uid(),r.first_name,r.last_name,lower(r.email),r.phone,'active',now()) returning id into v_client_id;
  else
    select user_id into v_existing_user from public.clients where id=v_client_id for update;
    if v_existing_user is not null and r.user_id is not null and v_existing_user<>r.user_id then raise exception 'identity_conflict'; end if;
    update public.clients set user_id=coalesce(user_id,r.user_id),first_name=coalesce(nullif(first_name,''),r.first_name),
      last_name=coalesce(nullif(last_name,''),r.last_name),phone=coalesce(phone,r.phone),access_status='active',activated_at=now(),updated_at=now()
    where id=v_client_id;
  end if;
  update public.access_requests set matched_client_id=v_client_id,status='approved',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
  return v_client_id;
end $$;

create policy access_requests_trainer on public.access_requests for all using(public.is_trainer()) with check(public.is_trainer());
create policy access_requests_own_read on public.access_requests for select using(user_id=auth.uid());
grant select,update on public.access_requests to authenticated;
grant execute on function public.submit_access_request(text,text,text,text,text) to anon,authenticated;
grant execute on function public.approve_access_request(uuid,uuid) to authenticated;
grant execute on function public.has_active_access(uuid) to authenticated;

drop policy if exists exercises_active_read on public.exercises;
create policy exercises_active_read on public.exercises for select using(
  public.is_trainer() or exists(select 1 from public.clients c where c.user_id=auth.uid() and c.access_status='active')
);
drop policy if exists routines_read on public.routines;
create policy routines_read on public.routines for select using(public.is_trainer() or public.has_active_access(client_id));
drop policy if exists routine_exercises_read on public.routine_exercises;
create policy routine_exercises_read on public.routine_exercises for select using(public.is_trainer() or exists(select 1 from public.routines r where r.id=routine_id and public.has_active_access(r.client_id)));
drop policy if exists sessions_read on public.workout_sessions;
create policy sessions_read on public.workout_sessions for select using(public.is_trainer() or public.has_active_access(client_id));
drop policy if exists sessions_client_insert on public.workout_sessions;
create policy sessions_client_insert on public.workout_sessions for insert with check(public.is_trainer() or public.has_active_access(client_id));
drop policy if exists sessions_client_update on public.workout_sessions;
create policy sessions_client_update on public.workout_sessions for update using(public.is_trainer() or public.has_active_access(client_id)) with check(public.is_trainer() or public.has_active_access(client_id));
drop policy if exists sets_read on public.set_logs;
create policy sets_read on public.set_logs for select using(public.is_trainer() or exists(select 1 from public.workout_sessions s where s.id=session_id and public.has_active_access(s.client_id)));
drop policy if exists sets_client_write on public.set_logs;
create policy sets_client_write on public.set_logs for all using(public.is_trainer() or exists(select 1 from public.workout_sessions s where s.id=session_id and public.has_active_access(s.client_id))) with check(public.is_trainer() or exists(select 1 from public.workout_sessions s where s.id=session_id and public.has_active_access(s.client_id)));
drop policy if exists measurements_write on public.measurements;
create policy measurements_write on public.measurements for all using(public.is_trainer() or public.has_active_access(client_id)) with check(public.is_trainer() or public.has_active_access(client_id));
