-- ═══════════════════════════════════════════════════════════
-- CeliScan — Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  username    text unique,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

-- ── Scans ─────────────────────────────────────────────────
create table if not exists public.scans (
  id                    uuid default gen_random_uuid() primary key,
  user_id               uuid references auth.users on delete set null,
  image_url             text,
  product_name          text not null default 'Unknown Product',
  brand                 text,
  gluten_status         text not null check (gluten_status in ('safe', 'unsafe', 'uncertain')),
  certainty_percentage  integer not null check (certainty_percentage between 0 and 100),
  ingredients           text[]   not null default '{}',
  gluten_sources        text[]   not null default '{}',
  cross_contamination   boolean  not null default false,
  cross_contamination_note text,
  analysis_notes        text,
  is_public             boolean  not null default false,
  created_at            timestamptz default now() not null
);

-- ── Indexes ───────────────────────────────────────────────
create index if not exists scans_user_id_idx      on public.scans (user_id);
create index if not exists scans_is_public_idx    on public.scans (is_public, created_at desc);
create index if not exists scans_gluten_status_idx on public.scans (gluten_status);

-- ── RLS ───────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.scans    enable row level security;

-- Profiles policies
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Scans policies
create policy "Public scans are viewable by everyone"
  on public.scans for select
  using (is_public = true or auth.uid() = user_id);

create policy "Users can insert their own scans"
  on public.scans for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own scans"
  on public.scans for update
  using (auth.uid() = user_id);

create policy "Users can delete their own scans"
  on public.scans for delete
  using (auth.uid() = user_id);

-- ── Storage Bucket ─────────────────────────────────────────
-- Run this separately or via the Supabase Dashboard:
-- Storage → New Bucket → name: "scan-images", Public: true

insert into storage.buckets (id, name, public)
  values ('scan-images', 'scan-images', true)
  on conflict (id) do nothing;

create policy "Anyone can view scan images"
  on storage.objects for select
  using (bucket_id = 'scan-images');

create policy "Authenticated users can upload scan images"
  on storage.objects for insert
  with check (bucket_id = 'scan-images' and auth.role() = 'authenticated');

create policy "Users can delete their own scan images"
  on storage.objects for delete
  using (bucket_id = 'scan-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- ── Auto-create Profile on Signup ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
