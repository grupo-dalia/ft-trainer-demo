begin;
create table if not exists public.chat_messages(
id uuid primary key default gen_random_uuid(),client_id uuid not null references public.clients(id),sender_id uuid not null references auth.users(id),body text not null check(length(btrim(body)) between 1 and 4000),created_at timestamptz not null default now());
create index if not exists chat_messages_client_created on public.chat_messages(client_id,created_at desc,id);
alter table public.chat_messages enable row level security;
create policy chat_participant_read on public.chat_messages for select to authenticated using(public.is_trainer() or public.owns_client(client_id));
create policy chat_participant_send on public.chat_messages for insert to authenticated with check(sender_id=auth.uid() and (public.is_trainer() or public.owns_client(client_id)));
revoke all on public.chat_messages from anon;
grant select,insert on public.chat_messages to authenticated;
commit;
