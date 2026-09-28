-- Noura / Investwin: central withdrawal security
-- Run in Supabase SQL Editor after setup.sql.
-- This migration is idempotent and fails closed from the client if not installed.

create table if not exists public.withdrawal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  plan_id text not null,
  kind text not null check (kind in ('profit', 'principal')),
  cycle_key text not null,
  amount numeric(38, 6) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, plan_id, kind, cycle_key)
);

-- The project may already have the older withdrawal_records table. Extend it safely.
alter table public.withdrawal_records add column if not exists plan_id text;
alter table public.withdrawal_records add column if not exists kind text;
alter table public.withdrawal_records add column if not exists cycle_key text;

create unique index if not exists withdrawal_records_once_idx
  on public.withdrawal_records (user_id, plan_id, kind, cycle_key)
  where plan_id is not null and kind is not null and cycle_key is not null;

create index if not exists withdrawal_records_wallet_day_idx
  on public.withdrawal_records (lower(wallet_address), created_at);

alter table public.withdrawal_records enable row level security;

drop policy if exists "users read own withdrawals" on public.withdrawal_records;
create policy "users read own withdrawals"
on public.withdrawal_records for select to authenticated
using (auth.uid() = user_id or public.is_admin());

revoke all on table public.withdrawal_records from anon;
revoke all on table public.withdrawal_records from authenticated;
grant select on public.withdrawal_records to authenticated;

drop function if exists public.reserve_withdrawal(uuid, text, text, text, numeric, text, numeric);
create or replace function public.reserve_withdrawal(
  p_user_id uuid,
  p_wallet_address text,
  p_plan_id text,
  p_kind text,
  p_amount numeric,
  p_cycle_key text,
  p_daily_limit numeric default 1000
)
returns table (withdrawal_id uuid, withdrawn_today numeric, remaining_today numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text := lower(trim(p_wallet_address));
  v_withdrawn numeric;
  v_id uuid;
  v_daily_limit constant numeric := 1000;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'withdrawal_auth_required';
  end if;
  if v_wallet = '' or p_amount is null or p_amount <= 0 then
    raise exception 'withdrawal_invalid_input';
  end if;
  if p_kind not in ('profit', 'principal') or coalesce(trim(p_plan_id), '') = '' or coalesce(trim(p_cycle_key), '') = '' then
    raise exception 'withdrawal_invalid_input';
  end if;

  -- Serialize reservations per wallet so concurrent tabs cannot bypass the daily limit.
  perform pg_advisory_xact_lock(hashtextextended(v_wallet, 0));

  if not exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and lower(coalesce(wallet_address, '')) = v_wallet
  ) then
    raise exception 'withdrawal_wallet_mismatch';
  end if;

  select coalesce(sum(amount), 0) into v_withdrawn
  from public.withdrawal_records
  where lower(wallet_address) = v_wallet
    and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    and created_at < (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc';

  if v_withdrawn + p_amount > v_daily_limit then
    raise exception 'withdrawal_daily_limit_exceeded';
  end if;

  insert into public.withdrawal_records (user_id, wallet_address, plan_id, kind, cycle_key, amount)
  values (auth.uid(), v_wallet, trim(p_plan_id), p_kind, trim(p_cycle_key), p_amount)
  returning id into v_id;

  return query select v_id, v_withdrawn + p_amount, greatest(0, v_daily_limit - v_withdrawn - p_amount);
exception
  when unique_violation then
    raise exception 'withdrawal_duplicate';
end;
$$;

revoke all on function public.reserve_withdrawal(uuid, text, text, text, numeric, text, numeric) from public;
grant execute on function public.reserve_withdrawal(uuid, text, text, text, numeric, text, numeric) to authenticated;

create or replace function public.get_withdrawal_summary(
  p_wallet_address text,
  p_daily_limit numeric default 1000
)
returns table (withdrawn_today numeric, remaining_today numeric, daily_limit numeric)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(w.amount), 0) as withdrawn_today,
    greatest(0, 1000 - coalesce(sum(w.amount), 0)) as remaining_today,
    1000::numeric as daily_limit
  from public.withdrawal_records w
  where auth.uid() is not null
    and lower(w.wallet_address) = lower(trim(p_wallet_address))
    and w.user_id = auth.uid()
    and w.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    and w.created_at < (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc';
$$;

revoke all on function public.get_withdrawal_summary(text, numeric) from public;
grant execute on function public.get_withdrawal_summary(text, numeric) to authenticated;
