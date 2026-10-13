-- Preserve existing exercises; the new form requires a movement pattern for new saves.
alter table public.exercises add column if not exists movement_pattern text;
comment on column public.exercises.movement_pattern is 'Movement pattern selected in the trainer exercise editor';
