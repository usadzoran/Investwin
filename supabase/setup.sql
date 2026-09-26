-- Noura / Investwin: Supabase database setup
-- Paste this entire script into Supabase Dashboard > SQL Editor > Run.
-- Safe to run more than once: tables, functions, trigger and policies use IF NOT EXISTS / DROP POLICY.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  wallet_address text,
  chain_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deposit_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  wallet_address text not null,
  chain_key text not null check (chain_key in ('ethereum', 'polygon', 'bnb')),
  tx_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  amount numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_key, tx_hash)
);

create table if not exists public.admin_transfers (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_address text not null,
  chain_key text not null check (chain_key in ('ethereum', 'polygon', 'bnb')),
  token_symbol text not null default 'USDT',
  amount numeric not null check (amount > 0),
  tx_hash text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_address text not null,
  recipient_address text not null,
  chain_key text not null check (chain_key in ('ethereum', 'polygon', 'bnb')),
  token_symbol text not null default 'USDT',
  amount numeric not null check (amount > 0),
  tx_hash text not null,
  status text not null default 'confirmed' check (status in ('submitted', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  unique (chain_key, tx_hash)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update
    set email = excluded.email,
        updated_at = now();

  update public.admin_users
  set email = new.email
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update of email on auth.users
for each row execute procedure public.handle_new_user_profile();

alter table public.admin_users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.deposit_records enable row level security;
alter table public.admin_transfers enable row level security;
alter table public.wallet_transfers enable row level security;

drop policy if exists "admins read admin users" on public.admin_users;
create policy "admins read admin users"
on public.admin_users for select to authenticated
using (public.is_admin());

drop policy if exists "users read own profile" on public.user_profiles;
create policy "users read own profile"
on public.user_profiles for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "users upsert own profile" on public.user_profiles;
create policy "users upsert own profile"
on public.user_profiles for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users update own profile" on public.user_profiles;
create policy "users update own profile"
on public.user_profiles for update to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "users read own deposits" on public.deposit_records;
create policy "users read own deposits"
on public.deposit_records for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "users add own deposits" on public.deposit_records;
create policy "users add own deposits"
on public.deposit_records for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "admins update deposits" on public.deposit_records;
create policy "admins update deposits"
on public.deposit_records for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read transfers" on public.admin_transfers;
create policy "admins read transfers"
on public.admin_transfers for select to authenticated
using (public.is_admin());

drop policy if exists "admins create transfers" on public.admin_transfers;
create policy "admins create transfers"
on public.admin_transfers for insert to authenticated
with check (public.is_admin() and admin_user_id = auth.uid());

drop policy if exists "admins update transfers" on public.admin_transfers;
create policy "admins update transfers"
on public.admin_transfers for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "users read own wallet transfers" on public.wallet_transfers;
create policy "users read own wallet transfers"
on public.wallet_transfers for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "users create own wallet transfers" on public.wallet_transfers;
create policy "users create own wallet transfers"
on public.wallet_transfers for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "admins update wallet transfers" on public.wallet_transfers;
create policy "admins update wallet transfers"
on public.wallet_transfers for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Bootstrap Admin only if this account already exists in Authentication > Users.
insert into public.admin_users (user_id, email)
select id, email
from auth.users
where lower(email) = lower('yakinporddz31@gmail.com')
on conflict (user_id) do update
set email = excluded.email,
    is_active = true;

-- Verification result: should return the five table names.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'admin_users',
    'user_profiles',
    'deposit_records',
    'admin_transfers',
    'wallet_transfers'
  )
order by table_name;
