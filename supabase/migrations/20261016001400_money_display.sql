-- Money display (D4, D5): daily exchange rates and per-currency display settings.
-- The admin sets every price in USD; the visitor sees it converted at the NBU cross rate with a markup and
-- charm rounding. Everyone reads both tables; only admins write (the daily job writes with the secret key).

-- Admin check ------------------------------------------------------------------------------------------
-- The catalog schema (#12) defines public.is_admin() from profiles. Without it this migration creates a
-- stub that grants admin to nobody, so the policies below already fail closed; #12's function takes over.
do $do$
begin
  if to_regprocedure('public.is_admin()') is null then
    create function public.is_admin()
    returns boolean
    language sql
    stable
    set search_path = ''
    as $fn$ select false $fn$;

    revoke all on function public.is_admin() from public;
    grant execute on function public.is_admin() to anon, authenticated, service_role;
  end if;
end;
$do$;

-- Exchange rates ---------------------------------------------------------------------------------------
-- source 'nbu': official NBU rates, stored as X→UAH, plus the USD→X cross rates derived from them.
-- source 'display': the USD→X rate prices are shown at. The daily job moves it only when the NBU cross rate
-- moved more than currency_settings.hysteresis_bps away from it, so displayed prices stay put day to day.

create table public.fx_rates (
  id         bigint generated always as identity primary key,
  rate_date  date not null,
  base       text not null check (base ~ '^[A-Z]{3}$'),
  quote      text not null check (quote ~ '^[A-Z]{3}$'),
  rate       numeric not null check (rate > 0),
  source     text not null check (source in ('nbu', 'display')),
  fetched_at timestamptz not null default now(),
  constraint fx_rates_distinct_currencies check (base <> quote),
  constraint fx_rates_rate_date_base_quote_source_key unique (rate_date, base, quote, source)
);

-- the reader takes the latest row per (source, base, quote)
create index fx_rates_latest_idx on public.fx_rates (source, base, quote, rate_date desc);

alter table public.fx_rates enable row level security;

create policy "fx rates are readable by everyone"
  on public.fx_rates for select to anon, authenticated
  using (true);

create policy "admins insert fx rates"
  on public.fx_rates for insert to authenticated
  with check ((select public.is_admin()));

create policy "admins update fx rates"
  on public.fx_rates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins delete fx rates"
  on public.fx_rates for delete to authenticated
  using ((select public.is_admin()));

-- Currency settings ------------------------------------------------------------------------------------
-- Amounts are in minor units of the currency (decimals = ISO 4217 exponent).
-- Charm rounding rounds the raw price up to the next value k × round_increment + ending. Below
-- small_price_below the small_* pair applies instead (EUR 29.90 under 100, 129 from 100 up).

create table public.currency_settings (
  currency              text primary key check (currency ~ '^[A-Z]{3}$'),
  decimals              smallint not null check (decimals between 0 and 4),
  markup_bps            integer not null default 300 check (markup_bps between 0 and 10000),
  round_increment       integer not null check (round_increment > 0),
  ending                integer not null check (ending >= 0 and ending < round_increment),
  small_price_below     integer check (small_price_below > 0),
  small_round_increment integer check (small_round_increment > 0),
  small_ending          integer check (small_ending >= 0 and small_ending < small_round_increment),
  hysteresis_bps        integer not null default 150 check (hysteresis_bps between 0 and 10000),
  enabled               boolean not null default true,
  constraint currency_settings_small_tier_complete check (
    num_nulls(small_price_below, small_round_increment, small_ending) in (0, 3)
  )
);

alter table public.currency_settings enable row level security;

create policy "currency settings are readable by everyone"
  on public.currency_settings for select to anon, authenticated
  using (true);

create policy "admins insert currency settings"
  on public.currency_settings for insert to authenticated
  with check ((select public.is_admin()));

create policy "admins update currency settings"
  on public.currency_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins delete currency settings"
  on public.currency_settings for delete to authenticated
  using ((select public.is_admin()));

-- D4: 3 % markup, hysteresis 1.5 % (within D4's 1–2 %), charm rounding per currency:
-- UAH 1 289, CZK 749, PLN 129, RON 129 (whole, ending 9 by tens); EUR, USD, CHF 29.90 under 100, 129 above.
insert into public.currency_settings
  (currency, decimals, round_increment, ending, small_price_below, small_round_increment, small_ending)
values
  ('UAH', 2, 1000, 900, null, null, null),
  ('EUR', 2, 1000, 900, 10000, 100, 90),
  ('USD', 2, 1000, 900, 10000, 100, 90),
  ('PLN', 2, 1000, 900, null, null, null),
  ('CZK', 2, 1000, 900, null, null, null),
  ('RON', 2, 1000, 900, null, null, null),
  ('CHF', 2, 1000, 900, 10000, 100, 90);
