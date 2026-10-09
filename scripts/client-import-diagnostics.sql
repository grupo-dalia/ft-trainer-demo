-- Read-only diagnostics: run in Supabase SQL editor; no personal data returned.
select has_sequence_privilege('authenticated','public.client_subscriber_number_seq','USAGE') as authenticated_sequence_usage;
select last_value, is_called from public.client_subscriber_number_seq;
select max(subscriber_number) as highest_assigned, count(*) as clients_count from public.clients;
select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename='clients';
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.clients'::regclass;
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='clients';
select tgname,pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.clients'::regclass and not tgisinternal;
select column_name,is_nullable,column_default,data_type from information_schema.columns where table_schema='public' and table_name='clients';
-- Check your account role separately using its authenticated session.
