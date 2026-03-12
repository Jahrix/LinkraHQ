-- Allow authenticated users to insert their own profile row.
-- Needed so upsert works for users who don't have a row yet
-- (e.g. OAuth users created before the profiles trigger was added).
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Backfill profile rows for any existing auth users that don't have one.
insert into public.profiles (id, full_name)
select id, raw_user_meta_data->>'full_name'
from auth.users
where id not in (select id from public.profiles);
