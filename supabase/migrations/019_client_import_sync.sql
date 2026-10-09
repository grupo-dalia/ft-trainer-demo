begin;
-- Invoker trigger needs sequence USAGE; RLS still controls every client write.
grant usage on sequence public.client_subscriber_number_seq to authenticated;
-- Prevent collisions caused by older manual assignments. Take an exclusive table
-- lock while advancing (never rewinding) the sequence.
lock table public.clients in access exclusive mode;
select setval('public.client_subscriber_number_seq', greatest(
 (select last_value from public.client_subscriber_number_seq),
 coalesce((select max(subscriber_number) from public.clients),1)), true);
alter table public.clients add column if not exists source_subscriber_number text;
create unique index if not exists clients_source_subscriber_unique
 on public.clients(source_subscriber_number)
 where source_subscriber_number is not null and source_subscriber_number <> '';
-- The external CSV number is text (leading zeros preserved), never an internal id.
commit;
