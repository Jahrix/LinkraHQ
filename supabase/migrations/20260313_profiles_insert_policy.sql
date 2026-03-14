-- Allow authenticated users to insert their own profile row.
-- Needed so upsert works for users who don't have a row yet
-- (e.g. OAuth users created before the profiles trigger was added).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id)';
  END IF;
END $$;

-- Backfill profile rows for any existing auth users that don't have one.
insert into public.profiles (id, full_name)
select id, raw_user_meta_data->>'full_name'
from auth.users
where id not in (select id from public.profiles);
