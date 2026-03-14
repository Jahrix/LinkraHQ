-- Habit Engine — M1
-- Creates habits and habit_completions tables with RLS

CREATE TABLE IF NOT EXISTS public.habits (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  frequency         text        NOT NULL DEFAULT 'daily'
                                CHECK (frequency IN ('daily', 'weekdays', 'custom')),
  custom_days       integer[]   NULL,
  color             text        NOT NULL DEFAULT '#7c5cfc',
  icon              text        NOT NULL DEFAULT '⚡',
  linked_project_id uuid        NULL,
  target_streak     integer     NOT NULL DEFAULT 30,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.habit_completions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id   uuid        NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(habit_id, date)
);

CREATE INDEX IF NOT EXISTS habits_user_created_idx
  ON public.habits(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS habit_completions_habit_date_idx
  ON public.habit_completions(habit_id, date DESC);

CREATE INDEX IF NOT EXISTS habit_completions_user_date_idx
  ON public.habit_completions(user_id, date DESC);

-- Row Level Security
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habits' AND policyname='habits_select_own') THEN
    EXECUTE 'CREATE POLICY "habits_select_own" ON public.habits FOR SELECT USING (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habits' AND policyname='habits_insert_own') THEN
    EXECUTE 'CREATE POLICY "habits_insert_own" ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habits' AND policyname='habits_update_own') THEN
    EXECUTE 'CREATE POLICY "habits_update_own" ON public.habits FOR UPDATE USING (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habits' AND policyname='habits_delete_own') THEN
    EXECUTE 'CREATE POLICY "habits_delete_own" ON public.habits FOR DELETE USING (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habit_completions' AND policyname='completions_select_own') THEN
    EXECUTE 'CREATE POLICY "completions_select_own" ON public.habit_completions FOR SELECT USING (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habit_completions' AND policyname='completions_insert_own') THEN
    EXECUTE 'CREATE POLICY "completions_insert_own" ON public.habit_completions FOR INSERT WITH CHECK (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habit_completions' AND policyname='completions_update_own') THEN
    EXECUTE 'CREATE POLICY "completions_update_own" ON public.habit_completions FOR UPDATE USING (auth.uid() = user_id)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='habit_completions' AND policyname='completions_delete_own') THEN
    EXECUTE 'CREATE POLICY "completions_delete_own" ON public.habit_completions FOR DELETE USING (auth.uid() = user_id)'; END IF;
END $$;
