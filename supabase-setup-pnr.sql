-- SUPABASE - DASHBOARD PNR TXF
-- Rode no Supabase: SQL Editor > New query > Run.
-- Versao segura para uso online: login obrigatorio, RLS ativo e dono por usuario.

create table if not exists public.pnr_dashboard_state (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pnr_dashboard_state
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.pnr_dashboard_state enable row level security;

revoke all on public.pnr_dashboard_state from anon;
revoke all on public.pnr_dashboard_state from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.pnr_dashboard_state to authenticated;

drop policy if exists "pnr_dashboard_state_team_read" on public.pnr_dashboard_state;
drop policy if exists "pnr_dashboard_state_team_insert" on public.pnr_dashboard_state;
drop policy if exists "pnr_dashboard_state_team_update" on public.pnr_dashboard_state;
drop policy if exists "pnr_dashboard_state_owner_read" on public.pnr_dashboard_state;
drop policy if exists "pnr_dashboard_state_owner_insert" on public.pnr_dashboard_state;
drop policy if exists "pnr_dashboard_state_owner_update" on public.pnr_dashboard_state;

create policy "pnr_dashboard_state_owner_read"
on public.pnr_dashboard_state
for select
to authenticated
using (
  id = 'xpt-ba-teixeira-03'
  and (
    owner_id is null
    or owner_id = (select auth.uid())
  )
);

create policy "pnr_dashboard_state_owner_insert"
on public.pnr_dashboard_state
for insert
to authenticated
with check (
  id = 'xpt-ba-teixeira-03'
  and owner_id = (select auth.uid())
);

create policy "pnr_dashboard_state_owner_update"
on public.pnr_dashboard_state
for update
to authenticated
using (
  id = 'xpt-ba-teixeira-03'
  and (
    owner_id is null
    or owner_id = (select auth.uid())
  )
)
with check (
  id = 'xpt-ba-teixeira-03'
  and owner_id = (select auth.uid())
);

create index if not exists pnr_dashboard_state_owner_idx
on public.pnr_dashboard_state(owner_id);

create index if not exists pnr_dashboard_state_updated_idx
on public.pnr_dashboard_state(updated_at desc);
