-- Investwin / Noura: complete manual Supabase setup for Polygon custodial USDT wallet
-- Paste this file into Supabase SQL Editor and run it once.
-- It is designed to be re-runnable and contains the base schema, deposit addresses, indexer, and custodial wallet migration.

-- ===== BASE SETUP =====
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

-- ===== POLYGON DEPOSIT ADDRESSES =====
-- Polygon deposit address allocation
-- The server stores only the public address. Private keys remain derivable only from the server-side master seed.
alter table public.user_profiles
  add column if not exists polygon_deposit_address text,
  add column if not exists polygon_deposit_derivation_index integer;

create unique index if not exists user_profiles_polygon_derivation_index_uq
  on public.user_profiles (polygon_deposit_derivation_index)
  where polygon_deposit_derivation_index is not null;

create unique index if not exists user_profiles_polygon_deposit_address_uq
  on public.user_profiles (lower(polygon_deposit_address))
  where polygon_deposit_address is not null;

create or replace function public.claim_polygon_deposit_wallet(
  p_user_id uuid,
  p_wallet_address text,
  p_derivation_index integer
)
returns table(wallet_address text, wallet_derivation_index integer, claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.user_profiles%rowtype;
begin
  if p_user_id is null or p_wallet_address !~* '^0x[0-9a-f]{40}$' or p_derivation_index < 0 then
    raise exception 'invalid_polygon_deposit_wallet_input';
  end if;

  select * into existing
  from public.user_profiles
  where user_id = p_user_id
  for update;

  if existing.polygon_deposit_address is not null and existing.polygon_deposit_address <> '' then
    return query select existing.polygon_deposit_address, existing.polygon_deposit_derivation_index, false;
    return;
  end if;

  update public.user_profiles
  set polygon_deposit_address = lower(p_wallet_address),
      polygon_deposit_derivation_index = p_derivation_index,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'user_profile_not_found';
  end if;

  return query select lower(p_wallet_address), p_derivation_index, true;
exception
  when unique_violation then
    raise exception 'polygon_derivation_index_conflict';
end;
$$;

revoke all on function public.claim_polygon_deposit_wallet(uuid, text, integer) from public;
grant execute on function public.claim_polygon_deposit_wallet(uuid, text, integer) to service_role;

-- ===== POLYGON INDEXER =====
create table if not exists public.user_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usdt_deposit_balance numeric not null default 0 check (usdt_deposit_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.polygon_indexer_state (
  chain_id integer primary key check (chain_id in (137, 80002)),
  token_address text not null,
  next_block bigint not null check (next_block >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_balances enable row level security;
alter table public.polygon_indexer_state enable row level security;
drop policy if exists "users read own balances" on public.user_balances;
create policy "users read own balances" on public.user_balances for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "admins read indexer state" on public.polygon_indexer_state;
create policy "admins read indexer state" on public.polygon_indexer_state for select to authenticated using (public.is_admin());

grant select on public.user_balances, public.polygon_indexer_state to authenticated;

create or replace function public.record_polygon_usdt_deposit(
  p_user_id uuid,
  p_wallet_address text,
  p_tx_hash text,
  p_amount numeric,
  p_block_number bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if p_amount <= 0 or p_tx_hash is null or p_tx_hash = '' then
    raise exception 'invalid_polygon_deposit';
  end if;
  insert into public.deposit_records (user_id, wallet_address, chain_key, tx_hash, status, amount, updated_at)
  values (p_user_id, lower(p_wallet_address), 'polygon', lower(p_tx_hash), 'completed', p_amount, now())
  on conflict (chain_key, tx_hash) do nothing
  returning id into inserted_id;

  if inserted_id is null then return false; end if;
  insert into public.user_balances (user_id, usdt_deposit_balance, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id) do update
    set usdt_deposit_balance = public.user_balances.usdt_deposit_balance + excluded.usdt_deposit_balance,
        updated_at = now();
  return true;
end;
$$;

create or replace function public.get_admin_treasury_stats()
returns table(total_deposits numeric, total_interest_distributed numeric, deposit_count bigint, confirmed_transfer_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce((select sum(amount) from public.deposit_records where chain_key = 'polygon' and status = 'completed'), 0),
    coalesce((select sum(amount) from public.admin_transfers where chain_key = 'polygon' and token_symbol = 'USDT' and status = 'confirmed'), 0),
    (select count(*) from public.deposit_records where chain_key = 'polygon' and status = 'completed'),
    (select count(*) from public.admin_transfers where chain_key = 'polygon' and token_symbol = 'USDT' and status = 'confirmed');
$$;

revoke all on function public.record_polygon_usdt_deposit(uuid, text, text, numeric, bigint) from public;
grant execute on function public.record_polygon_usdt_deposit(uuid, text, text, numeric, bigint) to service_role;
revoke all on function public.get_admin_treasury_stats() from public;
grant execute on function public.get_admin_treasury_stats() to service_role;

-- ===== CUSTODIAL POLYGON WALLET =====


create or replace function public.finalize_polygon_withdrawal(
  p_withdrawal_id uuid,
  p_status text,
  p_tx_hash text default null,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.polygon_withdrawal_requests%rowtype;
begin
  if p_status not in ('confirmed', 'failed') then raise exception 'invalid_withdrawal_final_status'; end if;
  select * into request from public.polygon_withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if request.status in ('confirmed', 'failed', 'cancelled') then return false; end if;

  if p_status = 'confirmed' then
    update public.polygon_withdrawal_requests
    set status = 'confirmed', tx_hash = lower(nullif(trim(coalesce(p_tx_hash, '')), '')), updated_at = now(), error_message = null
    where id = request.id;
    update public.custodial_wallet_balances
    set pending = greatest(0, pending - request.amount), updated_at = now()
    where user_id = request.user_id;
    update public.custodial_wallet_ledger
    set status = 'confirmed', tx_hash = lower(nullif(trim(coalesce(p_tx_hash, '')), ''))
    where withdrawal_id = request.id and entry_type = 'withdrawal';
  else
    update public.polygon_withdrawal_requests
    set status = 'failed', error_message = left(coalesce(p_error_message, 'Withdrawal transaction failed'), 500), updated_at = now()
    where id = request.id;
    update public.custodial_wallet_balances
    set available = available + request.amount, pending = greatest(0, pending - request.amount), updated_at = now()
    where user_id = request.user_id;
    update public.custodial_wallet_ledger
    set status = 'failed'
    where withdrawal_id = request.id and entry_type = 'withdrawal';
    insert into public.custodial_wallet_ledger (user_id, entry_type, amount, status, withdrawal_id, metadata)
    values (request.user_id, 'withdrawal_release', request.amount, 'confirmed', request.id, jsonb_build_object('reason', 'on_chain_failure'));
  end if;
  return true;
end;
$$;

revoke all on function public.finalize_polygon_withdrawal(uuid, text, text, text) from public;
grant execute on function public.finalize_polygon_withdrawal(uuid, text, text, text) to service_role;
