begin;
alter table public.payments add column if not exists payment_kind text not null default 'membership';
alter table public.payments alter column client_id drop not null;
alter table public.payments add constraint payments_kind_client_check check (
(payment_kind='membership' and client_id is not null) or
(payment_kind='daily_entry' and client_id is null and period_start is null and period_end is null));
commit;
