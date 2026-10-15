-- Nova Post international delivery (D10): flat rates per zone, the fallback estimate when the API is not
-- configured or cannot quote. Zones (src/lib/delivery/nova-post/countries.ts): A — Nova Post network
-- countries, B — the other EU countries (courier to the address), C — Switzerland.
-- The amounts are the owner's and not set yet: every zone starts as a TBD row (no amount, no currency) and the
-- site shows "TBD" until an admin sets it. Everyone reads; only admins change a rate; nobody adds or removes
-- a zone through the API (the zones are fixed in code).

create table public.nova_post_zone_rates (
  zone         text primary key check (zone in ('A', 'B', 'C')),
  -- minor units of `currency`; both null while the rate is TBD
  amount_minor integer check (amount_minor >= 0),
  currency     text references public.currency_settings (currency),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  constraint nova_post_zone_rates_amount_with_currency check (num_nulls(amount_minor, currency) in (0, 2))
);

create index nova_post_zone_rates_currency_idx on public.nova_post_zone_rates (currency);
create index nova_post_zone_rates_created_by_idx on public.nova_post_zone_rates (created_by);
create index nova_post_zone_rates_updated_by_idx on public.nova_post_zone_rates (updated_by);

create trigger nova_post_zone_rates_audit
  before insert or update on public.nova_post_zone_rates
  for each row execute function private.set_audit_columns();

alter table public.nova_post_zone_rates enable row level security;

create policy "nova post zone rates are readable by everyone"
  on public.nova_post_zone_rates for select to anon, authenticated
  using (true);

create policy "admins update nova post zone rates"
  on public.nova_post_zone_rates for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

-- the three zones, TBD until the owner sets their amounts
insert into public.nova_post_zone_rates (zone) values ('A'), ('B'), ('C');
