create table if not exists public.polygon_sweep_operations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  source_user_id uuid not null references auth.users(id) on delete restrict,
  source_address text not null,
  treasury_address text not null,
  token_address text not null,
  amount numeric not null check (amount > 0),
  chain_id integer not null default 137 check (chain_id in (137, 80002)),
  tx_hash text,
  status text not null default 'submitted' check (status in ('submitted','confirmed','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.polygon_sweep_operations enable row level security;
drop policy if exists "admins manage polygon sweeps" on public.polygon_sweep_operations;
create policy "admins manage polygon sweeps"
on public.polygon_sweep_operations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.polygon_sweep_operations to authenticated;
