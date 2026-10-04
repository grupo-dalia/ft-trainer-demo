begin;
alter table public.exercises add column if not exists tracking_type text not null default 'weight_reps' check(tracking_type in ('weight_reps','reps','time'));
alter table public.exercises alter column primary_muscle drop not null;
alter table public.exercises drop constraint if exists exercises_media_type_check;
alter table public.exercises add constraint exercises_media_type_check check(media_type in ('image','gif','video','youtube','vimeo'));
alter table public.set_logs add column if not exists duration_seconds integer check(duration_seconds between 1 and 86400);
commit;
