-- ═══════════════════════════════════════════════════════════
-- CeliScan — Social Schema Migration
-- Run this in your Supabase SQL Editor AFTER schema.sql
-- ═══════════════════════════════════════════════════════════

-- ── Extend scans table ─────────────────────────────────────
alter table public.scans
  add column if not exists caption        text,
  add column if not exists like_count     integer not null default 0,
  add column if not exists comment_count  integer not null default 0;

-- ── Post Likes ─────────────────────────────────────────────
create table if not exists public.post_likes (
  id         uuid default gen_random_uuid() primary key,
  scan_id    uuid not null references public.scans(id)  on delete cascade,
  user_id    uuid not null references auth.users(id)    on delete cascade,
  created_at timestamptz not null default now(),
  unique(scan_id, user_id)
);

-- ── Post Comments ──────────────────────────────────────────
create table if not exists public.post_comments (
  id         uuid default gen_random_uuid() primary key,
  scan_id    uuid not null references public.scans(id)  on delete cascade,
  user_id    uuid not null references auth.users(id)    on delete cascade,
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ── Conversations ──────────────────────────────────────────
-- participant1 < participant2 enforces canonical ordering
-- so (A,B) and (B,A) always map to the same row
create table if not exists public.conversations (
  id                    uuid default gen_random_uuid() primary key,
  participant1          uuid not null references auth.users(id) on delete cascade,
  participant2          uuid not null references auth.users(id) on delete cascade,
  last_message_at       timestamptz default now(),
  last_message_content  text,
  last_message_sender   uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint ordered_participants check (participant1 < participant2),
  unique(participant1, participant2)
);

-- ── Messages ───────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 2000),
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── Notifications ──────────────────────────────────────────
create table if not exists public.notifications (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null references auth.users(id)      on delete cascade,
  type            text not null check (type in ('like', 'comment', 'message')),
  from_user_id    uuid references auth.users(id)              on delete set null,
  scan_id         uuid references public.scans(id)            on delete set null,
  conversation_id uuid references public.conversations(id)    on delete set null,
  message_id      uuid references public.messages(id)         on delete set null,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────
create index if not exists post_likes_scan_id_idx      on public.post_likes(scan_id);
create index if not exists post_likes_user_id_idx      on public.post_likes(user_id);
create index if not exists post_comments_scan_id_idx   on public.post_comments(scan_id);
create index if not exists messages_conv_created_idx   on public.messages(conversation_id, created_at);
create index if not exists conv_p1_idx                 on public.conversations(participant1);
create index if not exists conv_p2_idx                 on public.conversations(participant2);
create index if not exists notifs_user_unread_idx      on public.notifications(user_id, is_read, created_at desc);

-- ── Enable RLS ─────────────────────────────────────────────
alter table public.post_likes     enable row level security;
alter table public.post_comments  enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.notifications  enable row level security;

-- ── post_likes policies ────────────────────────────────────
create policy "Anyone can view likes"
  on public.post_likes for select using (true);

create policy "Authenticated users can like"
  on public.post_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike their own"
  on public.post_likes for delete
  using (auth.uid() = user_id);

-- ── post_comments policies ─────────────────────────────────
create policy "Anyone can view comments"
  on public.post_comments for select using (true);

create policy "Authenticated users can comment"
  on public.post_comments for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own comments"
  on public.post_comments for delete
  using (auth.uid() = user_id);

-- ── conversations policies ─────────────────────────────────
create policy "Participants can view their conversations"
  on public.conversations for select
  using (auth.uid() = participant1 or auth.uid() = participant2);

create policy "Authenticated users can create conversations"
  on public.conversations for insert
  with check (auth.uid() = participant1 or auth.uid() = participant2);

-- ── messages policies ──────────────────────────────────────
create policy "Participants can view messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant1 = auth.uid() or c.participant2 = auth.uid())
    )
  );

create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant1 = auth.uid() or c.participant2 = auth.uid())
    )
  );

create policy "Participants can mark messages read"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant1 = auth.uid() or c.participant2 = auth.uid())
    )
  );

-- ── notifications policies ─────────────────────────────────
-- No INSERT policy: only SECURITY DEFINER triggers can insert
create policy "Users can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════

-- ── Like count + notification ──────────────────────────────
create or replace function public.handle_like_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Increment cached counter
    update public.scans set like_count = like_count + 1 where id = new.scan_id;
    -- Notify scan owner (skip self-likes)
    insert into public.notifications (user_id, type, from_user_id, scan_id)
    select s.user_id, 'like', new.user_id, new.scan_id
    from public.scans s
    where s.id = new.scan_id
      and s.user_id is not null
      and s.user_id <> new.user_id;

  elsif tg_op = 'DELETE' then
    update public.scans set like_count = greatest(0, like_count - 1) where id = old.scan_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_like_change on public.post_likes;
create trigger on_like_change
  after insert or delete on public.post_likes
  for each row execute procedure public.handle_like_change();

-- ── Comment count + notification ──────────────────────────
create or replace function public.handle_comment_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.scans set comment_count = comment_count + 1 where id = new.scan_id;
    insert into public.notifications (user_id, type, from_user_id, scan_id)
    select s.user_id, 'comment', new.user_id, new.scan_id
    from public.scans s
    where s.id = new.scan_id
      and s.user_id is not null
      and s.user_id <> new.user_id;

  elsif tg_op = 'DELETE' then
    update public.scans set comment_count = greatest(0, comment_count - 1) where id = old.scan_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_comment_change on public.post_comments;
create trigger on_comment_change
  after insert or delete on public.post_comments
  for each row execute procedure public.handle_comment_change();

-- ── Message → update conversation + notify recipient ──────
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recipient_id uuid;
begin
  -- Cache last message in conversation row
  update public.conversations
  set
    last_message_at      = new.created_at,
    last_message_content = left(new.content, 120),
    last_message_sender  = new.sender_id
  where id = new.conversation_id;

  -- Determine recipient
  select case
    when participant1 = new.sender_id then participant2
    else participant1
  end into recipient_id
  from public.conversations
  where id = new.conversation_id;

  -- Notify recipient
  if recipient_id is not null then
    insert into public.notifications (user_id, type, from_user_id, conversation_id, message_id)
    values (recipient_id, 'message', new.sender_id, new.conversation_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_message_sent on public.messages;
create trigger on_message_sent
  after insert on public.messages
  for each row execute procedure public.handle_new_message();
