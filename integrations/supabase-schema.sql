-- Roshni aur Lafz — Supabase Database Schema
-- Paste and run this script in your Supabase SQL Editor (supabase.com/dashboard/project/_/sql)

create table if not exists public.accounts (
  id text primary key,
  email text unique not null,
  display_name text,
  password_record jsonb,
  sessions jsonb default '[]'::jsonb,
  revision integer default 0,
  updated_at text,
  workspace jsonb,
  deleted_at bigint,
  restore_until bigint,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.accounts enable row level security;

-- Policy to allow publishable/anon key to select, insert, update, and delete
create policy "Allow all operations for anon"
  on public.accounts
  for all
  to anon
  using (true)
  with check (true);
