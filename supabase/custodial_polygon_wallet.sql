

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
