-- 006 only linked a client row when clients.user_id was NULL. In practice a
-- member can end up with two different auth.users rows for the same email
-- (e.g. they first requested access with email+password, then later signed
-- in with Google) — clients.user_id stays pointed at the old/abandoned
-- auth id, so the new session never matches it and the member keeps
-- landing on pendiente.html even with an active, paid client row.
-- This re-links by email regardless of the current user_id value, as long
-- as the session's own verified email matches the client row's email.
create or replace function public.link_client_identity()
returns public.clients
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_client public.clients%rowtype;
begin
  select * into v_client from public.clients where user_id = auth.uid() limit 1;
  if found then return v_client; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return null; end if;
  update public.clients set user_id = auth.uid(), updated_at = now()
    where lower(email) = v_email
    returning * into v_client;
  return v_client;
end $$;

grant execute on function public.link_client_identity() to authenticated;
