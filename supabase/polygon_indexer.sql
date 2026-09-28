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
