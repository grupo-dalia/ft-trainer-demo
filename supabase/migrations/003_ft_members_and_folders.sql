-- FT Trainer: modelo de socios y carpetas (aditivo, compatible con datos existentes).
create sequence if not exists public.client_subscriber_number_seq as bigint start 1;

alter table public.clients
  add column if not exists subscriber_number bigint,
  add column if not exists full_name text,
  add column if not exists dni text,
  add column if not exists address text,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists terms_accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists guardian_name text,
  add column if not exists guardian_dni text,
  add column if not exists signature_data text;

-- Conservar los datos antiguos y construir el nombre visible para los registros existentes.
update public.clients
set full_name = nullif(trim(concat_ws(' ', first_name, last_name)), '')
where full_name is null;

-- Asignación estable para clientes antiguos sin abonado.
with numbered as (
  select id, row_number() over (order by created_at asc, id asc) as n
  from public.clients
  where subscriber_number is null
)
update public.clients c
set subscriber_number = numbered.n
from numbered
where c.id = numbered.id;

select setval(
  'public.client_subscriber_number_seq',
  greatest(coalesce((select max(subscriber_number) from public.clients), 0), 1),
  true
);

create or replace function public.assign_subscriber_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.subscriber_number is null then
    new.subscriber_number := nextval('public.client_subscriber_number_seq');
  end if;
  if new.full_name is null or btrim(new.full_name) = '' then
    new.full_name := nullif(btrim(concat_ws(' ', new.first_name, new.last_name)), '');
  end if;
  if new.dni is not null then
    new.dni := upper(regexp_replace(btrim(new.dni), '[ -]', '', 'g'));
  end if;
  if new.phone is not null then
    new.phone := regexp_replace(btrim(new.phone), '[^0-9+]', '', 'g');
  end if;
  return new;
end $$;

drop trigger if exists clients_assign_subscriber_number on public.clients;
create trigger clients_assign_subscriber_number
before insert or update of first_name, last_name, full_name, dni, phone, subscriber_number
on public.clients for each row execute procedure public.assign_subscriber_number();

create unique index if not exists clients_subscriber_number_unique
  on public.clients(subscriber_number);
create unique index if not exists clients_dni_unique
  on public.clients(dni) where dni is not null and dni <> '';
create index if not exists clients_access_status_idx on public.clients(access_status);

-- Plantillas reutilizables. client_id y objective se conservan temporalmente para compatibilidad.
create table if not exists public.routine_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  parent_id uuid references public.routine_folders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.routines add column if not exists description text;
alter table public.routines add column if not exists folder_id uuid references public.routine_folders(id) on delete set null;
alter table public.routines alter column client_id drop not null;
create index if not exists routine_folders_parent_idx on public.routine_folders(parent_id);
create index if not exists routines_folder_idx on public.routines(folder_id);
alter table public.routine_folders enable row level security;
drop policy if exists routine_folders_read on public.routine_folders;
drop policy if exists routine_folders_trainer_manage on public.routine_folders;
create policy routine_folders_read on public.routine_folders for select using (public.is_trainer());
create policy routine_folders_trainer_manage on public.routine_folders for all using (public.is_trainer()) with check (public.is_trainer());
grant select, insert, update, delete on public.routine_folders to authenticated;

create or replace function public.validate_routine_folder_move(p_folder uuid, p_parent uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_folder is null or p_parent is null then return true; end if;
  if p_folder = p_parent then return false; end if;
  return not exists (
    with recursive descendants(id) as (
      select id from public.routine_folders where parent_id = p_folder
      union all select f.id from public.routine_folders f join descendants d on f.parent_id = d.id
    ) select 1 from descendants where id = p_parent
  );
end $$;
grant execute on function public.validate_routine_folder_move(uuid, uuid) to authenticated;

