create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_plan_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  daily_limit integer not null default 10 check (daily_limit > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.user_roles enable row level security;
alter table public.ai_plan_quotas enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ai_plan_quotas_select_own" on public.ai_plan_quotas;
create policy "ai_plan_quotas_select_own"
  on public.ai_plan_quotas
  for select
  to authenticated
  using (auth.uid() = user_id);

drop function if exists public.linkra_get_ai_plan_status(integer);
create or replace function public.linkra_get_ai_plan_status(p_daily_limit integer default 10)
returns table (
  is_admin boolean,
  used integer,
  daily_limit integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := current_date;
  v_is_admin boolean := exists(
    select 1
    from public.user_roles
    where user_id = v_user_id
      and role = 'admin'
  );
  v_used integer := 0;
  v_limit integer := greatest(1, coalesce(p_daily_limit, 10));
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select q.used, q.daily_limit
  into v_used, v_limit
  from public.ai_plan_quotas q
  where q.user_id = v_user_id
    and q.day = v_today;

  v_used := coalesce(v_used, 0);
  v_limit := greatest(1, coalesce(v_limit, p_daily_limit, 10));

  return query
  select
    v_is_admin,
    v_used,
    v_limit,
    greatest(0, v_limit - v_used);
end;
$$;

drop function if exists public.linkra_consume_ai_plan_quota(integer);
create or replace function public.linkra_consume_ai_plan_quota(p_daily_limit integer default 10)
returns table (
  is_admin boolean,
  used integer,
  daily_limit integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := current_date;
  v_is_admin boolean := exists(
    select 1
    from public.user_roles
    where user_id = v_user_id
      and role = 'admin'
  );
  v_limit integer := greatest(1, coalesce(p_daily_limit, 10));
  v_used integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if v_is_admin then
    return query
    select true, 0, v_limit, v_limit;
    return;
  end if;

  insert into public.ai_plan_quotas as q (user_id, day, used, daily_limit, updated_at)
  values (v_user_id, v_today, 1, v_limit, now())
  on conflict (user_id, day) do update
    set used = case
      when q.used >= q.daily_limit then q.used
      else q.used + 1
    end,
    daily_limit = greatest(1, coalesce(excluded.daily_limit, q.daily_limit)),
    updated_at = now()
  returning q.used, q.daily_limit
  into v_used, v_limit;

  return query
  select false, v_used, v_limit, greatest(0, v_limit - v_used);
end;
$$;

grant execute on function public.linkra_get_ai_plan_status(integer) to authenticated;
grant execute on function public.linkra_consume_ai_plan_quota(integer) to authenticated;
