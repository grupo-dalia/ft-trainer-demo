-- Registro publico: los datos obligatorios se contrastan con la ficha por DNI/NIE.
alter table public.access_requests add column if not exists dni text;
create index if not exists access_requests_dni_idx on public.access_requests(dni);

drop function if exists public.submit_access_request(text,text,text,text,text);
create or replace function public.submit_access_request(
  p_first_name text,p_last_name text,p_email text,p_phone text,p_dni text,p_source text default 'web'
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid; v_email text:=lower(trim(p_email)); v_phone text:=regexp_replace(trim(coalesce(p_phone,'')),'[^0-9+]','','g');
  v_dni text:=upper(regexp_replace(trim(coalesce(p_dni,'')),'[ -]','','g')); v_client public.clients%rowtype; v_reason text;
begin
  if length(trim(p_first_name))<2 or position('@' in v_email)<2 or v_dni !~ '^([XYZ][0-9]{7}|[0-9]{8})[A-Z]$' then raise exception 'invalid_request'; end if;
  select * into v_client from public.clients where dni=v_dni limit 1;
  if v_client.id is null then v_reason:='No existe una ficha con ese DNI/NIE';
  elsif coalesce(v_client.phone,'')<>v_phone then v_reason:='El telefono no coincide con la ficha del DNI/NIE';
  elsif lower(regexp_replace(coalesce(v_client.full_name,concat_ws(' ',v_client.first_name,v_client.last_name)),'\\s+',' ','g'))<>lower(regexp_replace(trim(p_first_name||' '||coalesce(p_last_name,'')),'\\s+',' ','g')) then v_reason:='El nombre no coincide con la ficha del DNI/NIE';
  elsif v_client.user_id is not null and v_client.user_id<>auth.uid() then v_reason:='El cliente ya esta unido a otra cuenta'; end if;
  insert into public.access_requests(user_id,matched_client_id,first_name,last_name,email,phone,dni,source,status,conflict_reason)
  values(auth.uid(),case when v_reason is null then v_client.id else null end,trim(p_first_name),trim(coalesce(p_last_name,'')),v_email,nullif(v_phone,''),v_dni,
    case when p_source in ('web','google','recovery','admin') then p_source else 'web' end,
    case when v_reason is null then 'pending' else 'needs_review' end,v_reason)
  on conflict ((lower(email))) do update set user_id=coalesce(excluded.user_id,access_requests.user_id),matched_client_id=excluded.matched_client_id,
    first_name=excluded.first_name,last_name=excluded.last_name,phone=excluded.phone,dni=excluded.dni,source=excluded.source,
    status=case when access_requests.status='approved' then 'approved' else excluded.status end,conflict_reason=excluded.conflict_reason,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'display_name',''))
  on conflict(id) do update set display_name=coalesce(nullif(excluded.display_name,''),profiles.display_name);
  update public.access_requests set user_id=new.id,updated_at=now()
  where lower(email)=lower(coalesce(new.email,'')) and user_id is null;
  return new;
end $$;

create or replace function public.approve_access_request(p_request_id uuid,p_client_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare r public.access_requests%rowtype; v_client_id uuid; v_existing_user uuid; v_email_owner uuid;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  select * into r from public.access_requests where id=p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  v_client_id:=coalesce(p_client_id,r.matched_client_id);
  if v_client_id is null then raise exception 'client_review_required'; end if;
  select user_id into v_existing_user from public.clients where id=v_client_id for update;
  select id into v_email_owner from public.clients where lower(email)=lower(r.email) and id<>v_client_id limit 1;
  if v_existing_user is not null and r.user_id is not null and v_existing_user<>r.user_id then raise exception 'identity_conflict'; end if;
  if v_email_owner is not null then raise exception 'email_in_use'; end if;
  update public.clients set user_id=coalesce(user_id,r.user_id),email=lower(r.email),access_status='active',activated_at=now(),updated_at=now() where id=v_client_id;
  update public.access_requests set matched_client_id=v_client_id,status='approved',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
  return v_client_id;
end $$;

grant execute on function public.submit_access_request(text,text,text,text,text,text) to anon,authenticated;
