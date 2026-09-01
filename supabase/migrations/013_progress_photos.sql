create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  recorded_on date not null default current_date, storage_path text not null, caption text, created_at timestamptz not null default now()
);
alter table public.progress_photos enable row level security;
drop policy if exists progress_photos_read on public.progress_photos;
create policy progress_photos_read on public.progress_photos for select to authenticated using (public.is_trainer() or public.owns_client(client_id));
drop policy if exists progress_photos_write on public.progress_photos;
create policy progress_photos_write on public.progress_photos for all to authenticated using (public.is_trainer() or public.owns_client(client_id)) with check (public.is_trainer() or public.owns_client(client_id));
grant select,insert,update,delete on public.progress_photos to authenticated;
create index if not exists progress_photos_client_date_idx on public.progress_photos(client_id,recorded_on desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('progress-photos','progress-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists progress_photos_storage_read on storage.objects;
create policy progress_photos_storage_read on storage.objects for select to authenticated using(bucket_id='progress-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists progress_photos_storage_insert on storage.objects;
create policy progress_photos_storage_insert on storage.objects for insert to authenticated with check(bucket_id='progress-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists progress_photos_storage_delete on storage.objects;
create policy progress_photos_storage_delete on storage.objects for delete to authenticated using(bucket_id='progress-photos' and (storage.foldername(name))[1]=auth.uid()::text);
