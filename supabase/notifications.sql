-- Investwin in-app payout notifications
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('payout_confirmed', 'deposit_confirmed', 'system')),
  title text not null,
  body text not null,
  tx_hash text,
  amount numeric,
  chain_key text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "users read own notifications" on public.user_notifications;
create policy "users read own notifications"
on public.user_notifications for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "users mark own notifications read" on public.user_notifications;
create policy "users mark own notifications read"
on public.user_notifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "admins create notifications" on public.user_notifications;
create policy "admins create notifications"
on public.user_notifications for insert to authenticated
with check (public.is_admin());

revoke all on public.user_notifications from anon;
grant select, update on public.user_notifications to authenticated;
grant insert on public.user_notifications to authenticated;

-- Add the table to Realtime once, without failing if it is already present.
do $$
begin
  alter publication supabase_realtime add table public.user_notifications;
exception
  when duplicate_object then null;
end;
$$;
