drop policy if exists clients_own_update on public.clients;
create policy clients_own_update on public.clients for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
grant update (first_name,last_name,full_name,phone,objective,updated_at) on public.clients to authenticated;
