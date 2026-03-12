-- Persistent conversation history for the Build page agent

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.agent_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text        not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_messages (
  id              uuid        primary key default gen_random_uuid(),
  conversation_id uuid        not null references agent_conversations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,
  action_taken    text        null,
  created_at      timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists agent_conversations_user_time_idx
  on public.agent_conversations(user_id, updated_at desc);

create index if not exists agent_messages_conv_time_idx
  on public.agent_messages(conversation_id, created_at asc);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.agent_conversations enable row level security;
alter table public.agent_messages      enable row level security;

drop policy if exists "agent_conv_select_own"  on public.agent_conversations;
drop policy if exists "agent_conv_insert_own"  on public.agent_conversations;
drop policy if exists "agent_conv_update_own"  on public.agent_conversations;
drop policy if exists "agent_conv_delete_own"  on public.agent_conversations;

create policy "agent_conv_select_own" on public.agent_conversations
  for select to authenticated using (auth.uid() = user_id);
create policy "agent_conv_insert_own" on public.agent_conversations
  for insert to authenticated with check (auth.uid() = user_id);
create policy "agent_conv_update_own" on public.agent_conversations
  for update to authenticated using (auth.uid() = user_id);
create policy "agent_conv_delete_own" on public.agent_conversations
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "agent_msg_select_own" on public.agent_messages;
drop policy if exists "agent_msg_insert_own" on public.agent_messages;
drop policy if exists "agent_msg_update_own" on public.agent_messages;
drop policy if exists "agent_msg_delete_own" on public.agent_messages;

create policy "agent_msg_select_own" on public.agent_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "agent_msg_insert_own" on public.agent_messages
  for insert to authenticated with check (auth.uid() = user_id);
create policy "agent_msg_update_own" on public.agent_messages
  for update to authenticated using (auth.uid() = user_id);
create policy "agent_msg_delete_own" on public.agent_messages
  for delete to authenticated using (auth.uid() = user_id);

-- ── RPC: list conversations with message counts ───────────────────────────────

drop function if exists public.linkra_get_agent_conversations();
create or replace function public.linkra_get_agent_conversations()
returns table (
  id            uuid,
  title         text,
  created_at    timestamptz,
  updated_at    timestamptz,
  message_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    count(m.id) as message_count
  from public.agent_conversations c
  left join public.agent_messages m on m.conversation_id = c.id
  where c.user_id = auth.uid()
  group by c.id, c.title, c.created_at, c.updated_at
  order by c.updated_at desc
  limit 50;
$$;

grant execute on function public.linkra_get_agent_conversations() to authenticated;
