-- The browser uses a Supabase publishable key. Protect data with explicit grants + RLS.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;

-- Signed-out visitors can only submit an access request. The function validates
-- input and returns an opaque request id; it never returns client information.
grant usage on schema public to anon;
grant execute on function public.submit_access_request(text,text,text,text,text,text) to anon, authenticated;

-- Authenticated application helpers. Each privileged helper performs its own
-- authorization check or is additionally constrained by RLS.
grant execute on function public.is_trainer() to authenticated;
grant execute on function public.owns_client(uuid) to authenticated;
grant execute on function public.has_active_access(uuid) to authenticated;
grant execute on function public.approve_access_request(uuid,uuid) to authenticated;
grant execute on function public.link_client_identity() to authenticated;
grant execute on function public.validate_routine_folder_move(uuid,uuid) to authenticated;
grant execute on function public.hall_of_fame_leaderboard(uuid,text,text) to authenticated;

-- Prevent future objects from silently becoming callable/readable by anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
