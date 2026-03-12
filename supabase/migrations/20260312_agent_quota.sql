-- Agent message log: rolling 5-hour window rate limit

create table if not exists public.agent_message_log (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists agent_message_log_user_time_idx
  on public.agent_message_log(user_id, created_at desc);

alter table public.agent_message_log enable row level security;

drop policy if exists "agent_log_insert_own" on public.agent_message_log;
create policy "agent_log_insert_own"
  on public.agent_message_log for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "agent_log_select_own" on public.agent_message_log;
create policy "agent_log_select_own"
  on public.agent_message_log for select to authenticated
  using (auth.uid() = user_id);

-- ── linkra_check_agent_quota ──────────────────────────────────────────────────
-- Check quota and, if allowed, insert a log row in one atomic call.
-- Returns: { allowed, used, limit, reset_in_minutes }

drop function if exists public.linkra_check_agent_quota();
create or replace function public.linkra_check_agent_quota()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid        := auth.uid();
  v_limit    integer     := 15;
  v_window   interval    := interval '5 hours';
  v_is_admin boolean;
  v_count    integer;
  v_oldest   timestamptz;
  v_reset    integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  v_is_admin := exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'admin'
  );

  if v_is_admin then
    insert into public.agent_message_log (user_id) values (v_user_id);
    return json_build_object(
      'allowed', true,
      'used', 0,
      'limit', 999,
      'reset_in_minutes', 0
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.agent_message_log
  where user_id = v_user_id
    and created_at > now() - v_window;

  v_count := coalesce(v_count, 0);

  if v_count >= v_limit then
    v_reset := greatest(0,
      ceil(300 - extract(epoch from (now() - v_oldest)) / 60)::integer
    );
    return json_build_object(
      'allowed', false,
      'used', v_count,
      'limit', v_limit,
      'reset_in_minutes', v_reset
    );
  end if;

  insert into public.agent_message_log (user_id) values (v_user_id);

  return json_build_object(
    'allowed', true,
    'used', v_count + 1,
    'limit', v_limit,
    'reset_in_minutes', 0
  );
end;
$$;

-- ── linkra_get_agent_quota_status ─────────────────────────────────────────────
-- Read-only quota check — no INSERT. Used by the GET /api/agent-quota endpoint.

drop function if exists public.linkra_get_agent_quota_status();
create or replace function public.linkra_get_agent_quota_status()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid        := auth.uid();
  v_limit    integer     := 15;
  v_window   interval    := interval '5 hours';
  v_is_admin boolean;
  v_count    integer;
  v_oldest   timestamptz;
  v_reset    integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  v_is_admin := exists (
    select 1 from public.user_roles
    where user_id = v_user_id and role = 'admin'
  );

  if v_is_admin then
    return json_build_object(
      'allowed', true,
      'used', 0,
      'limit', 999,
      'reset_in_minutes', 0
    );
  end if;

  select count(*), min(created_at)
  into v_count, v_oldest
  from public.agent_message_log
  where user_id = v_user_id
    and created_at > now() - v_window;

  v_count := coalesce(v_count, 0);

  if v_count >= v_limit then
    v_reset := greatest(0,
      ceil(300 - extract(epoch from (now() - v_oldest)) / 60)::integer
    );
  else
    v_reset := 0;
  end if;

  return json_build_object(
    'allowed', v_count < v_limit,
    'used', v_count,
    'limit', v_limit,
    'reset_in_minutes', v_reset
  );
end;
$$;

grant execute on function public.linkra_check_agent_quota()      to authenticated;
grant execute on function public.linkra_get_agent_quota_status() to authenticated;
