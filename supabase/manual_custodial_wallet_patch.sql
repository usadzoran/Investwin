-- Investwin: manual patch for the complete custodial Polygon wallet migration
-- Investwin: complete Polygon-only custodial USDT wallet migration
-- Safe to run after setup.sql, polygon_deposit_addresses.sql, and polygon_indexer.sql.

create extension if not exists pgcrypto;

alter table public.user_profiles
  add column if not exists polygon_withdrawal_address text;

create table if not exists public.custodial_wallet_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  asset text not null default 'USDT' check (asset = 'USDT'),
  network text not null default 'polygon' check (network = 'polygon'),
  available numeric(30, 6) not null default 0 check (available >= 0),
  pending numeric(30, 6) not null default 0 check (pending >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.custodial_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('deposit', 'withdrawal', 'withdrawal_release')),
  amount numeric(30, 6) not null check (amount > 0),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  tx_hash text,
  withdrawal_id uuid,
  chain_key text not null default 'polygon' check (chain_key = 'polygon'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.polygon_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_address text not null,
  amount numeric(30, 6) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'confirmed', 'failed', 'cancelled')),
  idempotency_key uuid not null,
  tx_hash text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.custodial_wallet_balances enable row level security;
alter table public.custodial_wallet_ledger enable row level security;
alter table public.polygon_withdrawal_requests enable row level security;

drop policy if exists "users read own custodial balance" on public.custodial_wallet_balances;
create policy "users read own custodial balance" on public.custodial_wallet_balances for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "users read own custodial ledger" on public.custodial_wallet_ledger;
create policy "users read own custodial ledger" on public.custodial_wallet_ledger for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "users read own withdrawal requests" on public.polygon_withdrawal_requests;
create policy "users read own withdrawal requests" on public.polygon_withdrawal_requests for select to authenticated using (auth.uid() = user_id or public.is_admin());

grant select on public.custodial_wallet_balances, public.custodial_wallet_ledger, public.polygon_withdrawal_requests to authenticated;

create unique index if not exists custodial_deposit_event_uq
  on public.custodial_wallet_ledger (chain_key, tx_hash, ((metadata->>'log_index')))
  where entry_type = 'deposit' and tx_hash is not null;

create or replace function public.record_polygon_custodial_deposit(
  p_user_id uuid,
  p_amount numeric,
  p_tx_hash text,
  p_log_index integer default 0,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare inserted_id uuid;
begin
  if p_user_id is null or p_amount <= 0 or nullif(trim(p_tx_hash), '') is null then
    raise exception 'invalid_custodial_deposit';
  end if;
  insert into public.custodial_wallet_ledger(user_id, entry_type, amount, status, tx_hash, metadata)
  values (p_user_id, 'deposit', p_amount, 'confirmed', lower(trim(p_tx_hash)), coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('log_index', p_log_index))
  on conflict do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;
  insert into public.custodial_wallet_balances(user_id, available, updated_at)
  values (p_user_id, p_amount, now())
  on conflict (user_id) do update set available = public.custodial_wallet_balances.available + excluded.available, updated_at = now();
  return true;
end;
$$;

create or replace function public.set_polygon_withdrawal_address(p_user_id uuid, p_address text)
returns text
language plpgsql security definer set search_path = public
as $$
declare normalized text := lower(trim(coalesce(p_address, '')));
begin
  if p_user_id is null or normalized !~ '^0x[0-9a-f]{40}$' then raise exception 'invalid_polygon_withdrawal_address'; end if;
  update public.user_profiles set polygon_withdrawal_address = normalized, updated_at = now() where user_id = p_user_id;
  if not found then raise exception 'user_profile_not_found'; end if;
  return normalized;
end;
$$;

create or replace function public.create_polygon_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_idempotency_key uuid
)
returns table(withdrawal_id uuid, status text, available numeric, pending numeric, destination_address text)
language plpgsql security definer set search_path = public
as $$
declare profile_address text; current_available numeric; request_row public.polygon_withdrawal_requests%rowtype;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 or p_idempotency_key is null then raise exception 'invalid_polygon_withdrawal_input'; end if;
  select polygon_withdrawal_address into profile_address from public.user_profiles where user_id = p_user_id;
  if profile_address is null or profile_address !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'withdrawal_address_not_set'; end if;
  select * into request_row from public.polygon_withdrawal_requests where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select b.available into current_available from public.custodial_wallet_balances b where b.user_id = p_user_id;
    return query select request_row.id, request_row.status, coalesce(current_available, 0), coalesce((select pending from public.custodial_wallet_balances where user_id = p_user_id), 0), request_row.destination_address; return;
  end if;
  insert into public.custodial_wallet_balances(user_id) values (p_user_id) on conflict (user_id) do nothing;
  select available into current_available from public.custodial_wallet_balances where user_id = p_user_id for update;
  if current_available < p_amount then raise exception 'insufficient_custodial_balance'; end if;
  insert into public.polygon_withdrawal_requests(user_id, destination_address, amount, idempotency_key)
  values (p_user_id, lower(profile_address), p_amount, p_idempotency_key) returning * into request_row;
  update public.custodial_wallet_balances set available = available - p_amount, pending = pending + p_amount, updated_at = now() where user_id = p_user_id;
  insert into public.custodial_wallet_ledger(user_id, entry_type, amount, status, withdrawal_id, metadata)
  values (p_user_id, 'withdrawal', p_amount, 'pending', request_row.id, jsonb_build_object('destination_address', lower(profile_address)));
  return query select request_row.id, request_row.status, available, pending, request_row.destination_address from public.custodial_wallet_balances where user_id = p_user_id;
end;
$$;

create or replace function public.finalize_polygon_withdrawal(
  p_withdrawal_id uuid, p_status text, p_tx_hash text default null, p_error_message text default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare request public.polygon_withdrawal_requests%rowtype;
begin
  if p_status not in ('confirmed', 'failed') then raise exception 'invalid_withdrawal_final_status'; end if;
  select * into request from public.polygon_withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if request.status in ('confirmed', 'failed', 'cancelled') then return false; end if;
  if p_status = 'confirmed' then
    update public.polygon_withdrawal_requests set status='confirmed', tx_hash=lower(nullif(trim(coalesce(p_tx_hash,'')),'')), updated_at=now(), error_message=null where id=request.id;
    update public.custodial_wallet_balances set pending=greatest(0,pending-request.amount), updated_at=now() where user_id=request.user_id;
    update public.custodial_wallet_ledger set status='confirmed', tx_hash=lower(nullif(trim(coalesce(p_tx_hash,'')),'')) where withdrawal_id=request.id and entry_type='withdrawal';
  else
    update public.polygon_withdrawal_requests set status='failed', error_message=left(coalesce(p_error_message,'Withdrawal transaction failed'),500), updated_at=now() where id=request.id;
    update public.custodial_wallet_balances set available=available+request.amount, pending=greatest(0,pending-request.amount), updated_at=now() where user_id=request.user_id;
    update public.custodial_wallet_ledger set status='failed' where withdrawal_id=request.id and entry_type='withdrawal';
    insert into public.custodial_wallet_ledger(user_id,entry_type,amount,status,withdrawal_id,metadata) values(request.user_id,'withdrawal_release',request.amount,'confirmed',request.id,jsonb_build_object('reason','on_chain_failure'));
  end if;
  return true;
end;
$$;

revoke all on function public.record_polygon_custodial_deposit(uuid,numeric,text,integer,jsonb) from public;
grant execute on function public.record_polygon_custodial_deposit(uuid,numeric,text,integer,jsonb) to service_role;
revoke all on function public.set_polygon_withdrawal_address(uuid,text) from public;
grant execute on function public.set_polygon_withdrawal_address(uuid,text) to service_role;
revoke all on function public.create_polygon_withdrawal(uuid,numeric,uuid) from public;
grant execute on function public.create_polygon_withdrawal(uuid,numeric,uuid) to service_role;
revoke all on function public.finalize_polygon_withdrawal(uuid,text,text,text) from public;
grant execute on function public.finalize_polygon_withdrawal(uuid,text,text,text) to service_role;
