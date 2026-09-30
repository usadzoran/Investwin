-- Investwin: repair patch for an earlier partial custodial wallet migration
-- Run this after the error: column "chain_key" does not exist.

alter table if exists public.custodial_wallet_ledger
  add column if not exists chain_key text default 'polygon',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists withdrawal_id uuid;

update public.custodial_wallet_ledger
set chain_key = 'polygon'
where chain_key is null;

alter table if exists public.custodial_wallet_ledger
  alter column chain_key set default 'polygon',
  alter column chain_key set not null;

alter table if exists public.custodial_wallet_balances
  add column if not exists asset text default 'USDT',
  add column if not exists network text default 'polygon',
  add column if not exists available numeric(30,6) not null default 0,
  add column if not exists pending numeric(30,6) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.custodial_wallet_balances
set asset = 'USDT' where asset is null;
update public.custodial_wallet_balances
set network = 'polygon' where network is null;

alter table if exists public.polygon_withdrawal_requests
  add column if not exists user_id uuid,
  add column if not exists destination_address text,
  add column if not exists amount numeric(30,6),
  add column if not exists status text default 'pending',
  add column if not exists idempotency_key uuid default gen_random_uuid(),
  add column if not exists tx_hash text,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists custodial_deposit_event_uq
  on public.custodial_wallet_ledger (chain_key, tx_hash, ((metadata->>'log_index')))
  where entry_type = 'deposit' and tx_hash is not null;

-- Re-run the complete function definitions after the columns are repaired.

create or replace function public.record_polygon_custodial_deposit(
  p_user_id uuid, p_amount numeric, p_tx_hash text,
  p_log_index integer default 0, p_metadata jsonb default '{}'::jsonb
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare inserted_id uuid;
begin
  if p_user_id is null or p_amount <= 0 or nullif(trim(p_tx_hash), '') is null then raise exception 'invalid_custodial_deposit'; end if;
  insert into public.custodial_wallet_ledger(user_id, entry_type, amount, status, tx_hash, chain_key, metadata)
  values (p_user_id, 'deposit', p_amount, 'confirmed', lower(trim(p_tx_hash)), 'polygon', coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('log_index', p_log_index))
  on conflict do nothing returning id into inserted_id;
  if inserted_id is null then return false; end if;
  insert into public.custodial_wallet_balances(user_id, asset, network, available, pending, updated_at)
  values (p_user_id, 'USDT', 'polygon', p_amount, 0, now())
  on conflict (user_id) do update set available = public.custodial_wallet_balances.available + excluded.available, updated_at = now();
  return true;
end;
$$;

create or replace function public.set_polygon_withdrawal_address(p_user_id uuid, p_address text)
returns text language plpgsql security definer set search_path = public
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
  p_user_id uuid, p_amount numeric, p_idempotency_key uuid
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
    select available into current_available from public.custodial_wallet_balances where user_id = p_user_id;
    return query select request_row.id, request_row.status, coalesce(current_available,0), coalesce((select pending from public.custodial_wallet_balances where user_id=p_user_id),0), request_row.destination_address;
    return;
  end if;
  insert into public.custodial_wallet_balances(user_id,asset,network) values(p_user_id,'USDT','polygon') on conflict(user_id) do nothing;
  select available into current_available from public.custodial_wallet_balances where user_id=p_user_id for update;
  if current_available < p_amount then raise exception 'insufficient_custodial_balance'; end if;
  insert into public.polygon_withdrawal_requests(user_id,destination_address,amount,status,idempotency_key)
  values(p_user_id,lower(profile_address),p_amount,'pending',p_idempotency_key) returning * into request_row;
  update public.custodial_wallet_balances set available=available-p_amount,pending=pending+p_amount,updated_at=now() where user_id=p_user_id;
  insert into public.custodial_wallet_ledger(user_id,entry_type,amount,status,withdrawal_id,chain_key,metadata)
  values(p_user_id,'withdrawal',p_amount,'pending',request_row.id,'polygon',jsonb_build_object('destination_address',lower(profile_address)));
  return query select request_row.id,request_row.status,b.available,b.pending,request_row.destination_address from public.custodial_wallet_balances b where b.user_id=p_user_id;
end;
$$;

create or replace function public.finalize_polygon_withdrawal(
  p_withdrawal_id uuid, p_status text, p_tx_hash text default null, p_error_message text default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare request public.polygon_withdrawal_requests%rowtype;
begin
  if p_status not in ('confirmed','failed') then raise exception 'invalid_withdrawal_final_status'; end if;
  select * into request from public.polygon_withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if request.status in ('confirmed','failed','cancelled') then return false; end if;
  if p_status='confirmed' then
    update public.polygon_withdrawal_requests set status='confirmed',tx_hash=lower(nullif(trim(coalesce(p_tx_hash,'')),'')),updated_at=now(),error_message=null where id=request.id;
    update public.custodial_wallet_balances set pending=greatest(0,pending-request.amount),updated_at=now() where user_id=request.user_id;
    update public.custodial_wallet_ledger set status='confirmed',tx_hash=lower(nullif(trim(coalesce(p_tx_hash,'')),'')) where withdrawal_id=request.id and entry_type='withdrawal';
  else
    update public.polygon_withdrawal_requests set status='failed',error_message=left(coalesce(p_error_message,'Withdrawal transaction failed'),500),updated_at=now() where id=request.id;
    update public.custodial_wallet_balances set available=available+request.amount,pending=greatest(0,pending-request.amount),updated_at=now() where user_id=request.user_id;
    update public.custodial_wallet_ledger set status='failed' where withdrawal_id=request.id and entry_type='withdrawal';
    insert into public.custodial_wallet_ledger(user_id,entry_type,amount,status,withdrawal_id,chain_key,metadata) values(request.user_id,'withdrawal_release',request.amount,'confirmed',request.id,'polygon',jsonb_build_object('reason','on_chain_failure'));
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
