-- Money display tables: structure, seeded settings, public read, admin-only write (negative tests included).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Structure -----------------------------------------------------------------------------------------------
select has_table('public', 'fx_rates', 'fx_rates exists');
select has_table('public', 'currency_settings', 'currency_settings exists');
select ok((select relrowsecurity from pg_class where oid = 'public.fx_rates'::regclass), 'RLS on fx_rates');
select ok((select relrowsecurity from pg_class where oid = 'public.currency_settings'::regclass), 'RLS on currency_settings');
select col_is_pk('public', 'currency_settings', 'currency', 'currency is the key of currency_settings');
select has_function('public', 'is_admin', 'is_admin() exists (from #12 or the stub)');

-- Seeded settings (D4) --------------------------------------------------------------------------------------
select results_eq(
  'select currency from public.currency_settings order by currency',
  $$values ('CHF'), ('CZK'), ('EUR'), ('PLN'), ('RON'), ('UAH'), ('USD')$$,
  'the seven currencies are seeded'
);
select is(
  (select count(*)::int from public.currency_settings where markup_bps = 300 and hysteresis_bps = 150 and enabled),
  7,
  'every currency starts with 3 % markup, 1.5 % hysteresis, enabled'
);
select is(
  (select array_agg(currency order by currency) from public.currency_settings where small_price_below = 10000),
  array['CHF', 'EUR', 'USD'],
  'EUR, USD and CHF round to .90 under 100'
);

-- Constraints -------------------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.fx_rates (rate_date, base, quote, rate, source) values ('2026-10-15', 'USD', 'EUR', 0.9, 'nbu')$$,
  '23505', null, 'one rate per date, pair and source'
);
select throws_ok(
  $$insert into public.fx_rates (rate_date, base, quote, rate, source) values ('2030-01-01', 'USD', 'EUR', 0, 'nbu')$$,
  '23514', null, 'a rate must be positive'
);
select throws_ok(
  $$update public.currency_settings set small_ending = null where currency = 'EUR'$$,
  '23514', null, 'the small-price tier is all or nothing'
);

-- Anonymous visitor: reads, never writes -----------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.currency_settings), 7, 'anon reads currency_settings');
select ok((select count(*) from public.fx_rates) > 0, 'anon reads fx_rates');
select throws_ok(
  $$insert into public.fx_rates (rate_date, base, quote, rate, source) values ('2030-01-01', 'USD', 'EUR', 0.9, 'nbu')$$,
  '42501', null, 'anon cannot insert a rate'
);
update public.currency_settings set markup_bps = 0;
reset role;
select is((select count(*)::int from public.currency_settings where markup_bps = 300), 7, 'anon update changes nothing');

-- Signed-in customer: reads, never writes ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.currency_settings), 7, 'a customer reads currency_settings');
select throws_ok(
  $$insert into public.fx_rates (rate_date, base, quote, rate, source) values ('2030-01-01', 'USD', 'EUR', 0.9, 'display')$$,
  '42501', null, 'a customer cannot insert a rate'
);
select throws_ok(
  $$insert into public.currency_settings (currency, decimals, round_increment, ending) values ('GBP', 2, 100, 0)$$,
  '42501', null, 'a customer cannot add a currency'
);
update public.currency_settings set markup_bps = 0;
delete from public.fx_rates;
reset role;
select is((select count(*)::int from public.currency_settings where markup_bps = 300), 7, 'a customer update changes nothing');
select ok((select count(*) from public.fx_rates) > 0, 'a customer delete removes nothing');

-- Admin: writes. is_admin() is swapped for this transaction only, so the test does not depend on how
-- the admin role is stored (profiles from #12, or the stub that grants it to nobody).
create or replace function public.is_admin()
returns boolean language sql stable set search_path = ''
as $$ select (select auth.uid()) = '00000000-0000-4000-8000-0000000000a1'::uuid $$;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.fx_rates (rate_date, base, quote, rate, source) values ('2030-01-01', 'USD', 'EUR', 0.9, 'display')$$,
  'an admin inserts a rate'
);
update public.currency_settings set markup_bps = 250 where currency = 'PLN';
reset role;
select is((select markup_bps from public.currency_settings where currency = 'PLN'), 250, 'an admin edits the markup');

-- A revoked admin loses write access.
create or replace function public.is_admin()
returns boolean language sql stable set search_path = '' as $$ select false $$;
set local role authenticated;
update public.currency_settings set markup_bps = 100 where currency = 'PLN';
select throws_ok(
  $$insert into public.fx_rates (rate_date, base, quote, rate, source) values ('2030-01-02', 'USD', 'EUR', 0.9, 'display')$$,
  '42501', null, 'a revoked admin cannot insert a rate'
);
reset role;
select is((select markup_bps from public.currency_settings where currency = 'PLN'), 250, 'a revoked admin cannot edit');

select * from finish();
rollback;
