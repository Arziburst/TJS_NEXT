-- Nova Poshta dictionary cache (D10): the settlements and branches/parcel lockers customers looked up, so a
-- repeated search does not call the API again. np_lookups keeps each search (its parameters and the ordered
-- refs it answered); np_settlements and np_warehouses keep the rows. Refresh policy (src/lib/delivery/nova-poshta/
-- dictionary.ts): a lookup older than a day is fetched again on its next use (the stale answer is served when
-- the API fails); the daily job (/api/cron/nova-poshta) refreshes the recently used ones and prunes lookups
-- unused for 30 days and the rows no lookup names any more.
-- Carrier data, written and read only by the server (service role): RLS on, no policy for anon or
-- authenticated, and their table privileges revoked.

create table public.np_settlements (
  ref              uuid primary key,
  city_ref         uuid not null,
  name             text not null check (char_length(name) between 1 and 200),
  label            text not null check (char_length(label) between 1 and 400),
  area             text not null default '',
  region           text not null default '',
  warehouse_count  integer not null default 0 check (warehouse_count >= 0),
  address_delivery boolean not null default false,
  fetched_at       timestamptz not null default now()
);

create table public.np_warehouses (
  ref            uuid primary key,
  settlement_ref uuid not null,
  city_ref       uuid not null,
  number         integer not null check (number >= 0),
  kind           text not null check (kind in ('branch', 'postomat')),
  type_ref       uuid not null,
  name           text not null check (char_length(name) between 1 and 400),
  short_address  text not null default '',
  max_weight_kg  numeric check (max_weight_kg > 0),
  fetched_at     timestamptz not null default now()
);

create index np_warehouses_settlement_ref_idx on public.np_warehouses (settlement_ref);

create table public.np_lookups (
  -- 'settlements:<query>' or 'warehouses:<settlement ref>:<kind>:<query>', the query normalized
  key          text primary key check (char_length(key) between 1 and 300),
  kind         text not null check (kind in ('settlements', 'warehouses')),
  params       jsonb not null,
  refs         uuid[] not null,
  fetched_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index np_lookups_last_used_at_idx on public.np_lookups (last_used_at);
create index np_lookups_fetched_at_idx on public.np_lookups (fetched_at);
-- the prune looks every row up in the lookups' refs
create index np_lookups_refs_idx on public.np_lookups using gin (refs);

alter table public.np_settlements enable row level security;
alter table public.np_warehouses enable row level security;
alter table public.np_lookups enable row level security;

revoke all on table public.np_settlements, public.np_warehouses, public.np_lookups from anon, authenticated;

-- Removes the rows no lookup names any more (after the daily job pruned and refreshed the lookups).
create function public.np_prune_dictionary()
returns table (settlements integer, warehouses integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settlements integer;
  v_warehouses integer;
begin
  delete from public.np_warehouses w
  where not exists (select 1 from public.np_lookups l where l.kind = 'warehouses' and l.refs @> array[w.ref]);
  get diagnostics v_warehouses = row_count;

  delete from public.np_settlements s
  where not exists (select 1 from public.np_lookups l where l.kind = 'settlements' and l.refs @> array[s.ref]);
  get diagnostics v_settlements = row_count;

  return query select v_settlements, v_warehouses;
end;
$$;

revoke all on function public.np_prune_dictionary() from public, anon, authenticated;
grant execute on function public.np_prune_dictionary() to service_role;
