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
