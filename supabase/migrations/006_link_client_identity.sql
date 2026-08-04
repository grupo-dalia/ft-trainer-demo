-- Self-heals the case where a client row (created manually by the trainer,
-- imported from CSV, or matched at signup before the email was set) never
-- got linked to the member's own auth account. Without this, a member can
-- have an "active" client row with a valid payment yet still be sent to
-- pendiente.html because clients.user_id never pointed at their session.
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
    where lower(email) = v_email and user_id is null
    returning * into v_client;
  return v_client;
end $$;

grant execute on function public.link_client_identity() to authenticated;
