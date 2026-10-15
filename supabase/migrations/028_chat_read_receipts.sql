begin;
alter table public.chat_messages add column if not exists read_at timestamptz;
-- Clients can send content, but cannot forge read receipts or timestamps.
revoke insert on public.chat_messages from authenticated;
grant insert (client_id,sender_id,body) on public.chat_messages to authenticated;
create or replace function public.mark_chat_messages_read(p_message_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  update public.chat_messages m set read_at=now()
  where m.id=any(p_message_ids) and m.read_at is null and m.sender_id<>auth.uid()
    and (public.is_trainer() or public.owns_client(m.client_id));
end;
$$;
revoke all on function public.mark_chat_messages_read(uuid[]) from public,anon;
grant execute on function public.mark_chat_messages_read(uuid[]) to authenticated;
commit;
