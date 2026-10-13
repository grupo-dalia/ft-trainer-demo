-- Clients can consult shared exercises and create personal ones, but cannot modify catalog records.
drop policy if exists exercises_client_update_own on public.exercises;
-- Existing trainer management policy continues to authorize all trainer operations.
