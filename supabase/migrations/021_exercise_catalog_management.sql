-- Catalog overrides retain workout and routine references; deletion archives records.
alter table public.exercises add column if not exists source_catalog_id text;
create unique index if not exists exercises_source_catalog_unique on public.exercises(source_catalog_id) where source_catalog_id is not null;
-- Check creator role without depending on the caller's profiles SELECT policy.
create or replace function public.is_shared_exercise_creator(p_creator uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select p_creator is null or exists(select 1 from public.profiles where id=p_creator and role='trainer') $$;
revoke all on function public.is_shared_exercise_creator(uuid) from public;
grant execute on function public.is_shared_exercise_creator(uuid) to authenticated;
-- Client-owned exercise creation remains private; shared catalog edits require trainer role.
drop policy if exists exercises_client_update_own on public.exercises;
create policy exercises_client_update_own on public.exercises for update
using (created_by=auth.uid() and is_custom and source_catalog_id is null and not public.is_trainer())
with check (created_by=auth.uid() and is_custom and source_catalog_id is null);
drop policy if exists exercises_client_create on public.exercises;
create policy exercises_client_create on public.exercises for insert
with check (created_by=auth.uid() and is_custom and source_catalog_id is null);
drop policy if exists exercises_active_read on public.exercises;
create policy exercises_active_read on public.exercises for select using (
public.is_trainer() or (is_active and exists(select 1 from public.clients c where c.user_id=auth.uid() and c.access_status='active') and
(created_by=auth.uid() or public.is_shared_exercise_creator(created_by))));
