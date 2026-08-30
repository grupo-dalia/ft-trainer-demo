create table if not exists public.trainer_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '',
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null default 0 check (file_size >= 0),
  created_by uuid references auth.users(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_materials (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.trainer_materials(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (material_id, client_id)
);

create index if not exists client_materials_client_idx
  on public.client_materials(client_id, assigned_at desc);

alter table public.trainer_materials enable row level security;
alter table public.client_materials enable row level security;

drop policy if exists trainer_materials_trainer_manage on public.trainer_materials;
create policy trainer_materials_trainer_manage on public.trainer_materials
  for all using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists trainer_materials_assigned_read on public.trainer_materials;
create policy trainer_materials_assigned_read on public.trainer_materials
  for select using (
    public.is_trainer() or exists (
      select 1 from public.client_materials cm
      join public.clients c on c.id = cm.client_id
      where cm.material_id = trainer_materials.id and c.user_id = auth.uid()
    )
  );

drop policy if exists client_materials_trainer_manage on public.client_materials;
create policy client_materials_trainer_manage on public.client_materials
  for all using (public.is_trainer()) with check (public.is_trainer());

drop policy if exists client_materials_own_read on public.client_materials;
create policy client_materials_own_read on public.client_materials
  for select using (public.owns_client(client_id));

drop policy if exists client_materials_own_update on public.client_materials;
create policy client_materials_own_update on public.client_materials
  for update using (public.owns_client(client_id))
  with check (public.owns_client(client_id));

grant select, insert, update, delete on public.trainer_materials to authenticated;
grant select, insert, delete on public.client_materials to authenticated;
grant update (viewed_at) on public.client_materials to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trainer-materials', 'trainer-materials', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists trainer_materials_storage_insert on storage.objects;
create policy trainer_materials_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'trainer-materials' and public.is_trainer());

drop policy if exists trainer_materials_storage_update on storage.objects;
create policy trainer_materials_storage_update on storage.objects for update to authenticated
using (bucket_id = 'trainer-materials' and public.is_trainer())
with check (bucket_id = 'trainer-materials' and public.is_trainer());

drop policy if exists trainer_materials_storage_delete on storage.objects;
create policy trainer_materials_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'trainer-materials' and public.is_trainer());

drop policy if exists trainer_materials_storage_read on storage.objects;
create policy trainer_materials_storage_read on storage.objects for select to authenticated
using (
  bucket_id = 'trainer-materials' and (
    public.is_trainer() or exists (
      select 1 from public.trainer_materials tm
      join public.client_materials cm on cm.material_id = tm.id
      join public.clients c on c.id = cm.client_id
      where tm.storage_path = storage.objects.name and c.user_id = auth.uid()
    )
  )
);
