-- Nova Post zone flat rates: structure, TBD rows, public read, admin-only update (negative tests included).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixtures: a customer and an admin (the role is granted here, as the database owner; D12)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000023c1', 'customer-' || gen_random_uuid() || '@example.test'),
  ('00000000-0000-4000-8000-0000000023a1', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000023a1';

-- Structure -----------------------------------------------------------------------------------------------
select has_table('public', 'nova_post_zone_rates', 'nova_post_zone_rates exists');
select ok((select relrowsecurity from pg_class where oid = 'public.nova_post_zone_rates'::regclass), 'RLS on nova_post_zone_rates');
select col_is_pk('public', 'nova_post_zone_rates', 'zone', 'zone is the key');

-- Reference rows: the three zones, TBD -----------------------------------------------------------------------
select results_eq(
  'select zone from public.nova_post_zone_rates order by zone',
  $$values ('A'), ('B'), ('C')$$,
  'zones A, B and C exist'
);
select is(
  (select count(*)::int from public.nova_post_zone_rates where amount_minor is null and currency is null),
  3,
  'every zone starts TBD: no amount, no currency'
);

-- Constraints -------------------------------------------------------------------------------------------------
select throws_ok(
  $$update public.nova_post_zone_rates set amount_minor = 1000 where zone = 'A'$$,
  '23514', null, 'an amount needs its currency'
);
select throws_ok(
  $$update public.nova_post_zone_rates set amount_minor = -1, currency = 'EUR' where zone = 'A'$$,
  '23514', null, 'an amount is never negative'
);
select throws_ok(
  $$update public.nova_post_zone_rates set amount_minor = 1000, currency = 'GBP' where zone = 'A'$$,
  '23503', null, 'the currency is one of currency_settings'
);
select throws_ok(
  $$insert into public.nova_post_zone_rates (zone) values ('D')$$,
  '23514', null, 'only zones A, B and C exist'
);

-- Anonymous visitor: reads, never writes -----------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.nova_post_zone_rates), 3, 'anon reads the zones');
update public.nova_post_zone_rates set amount_minor = 1, currency = 'EUR';
select throws_ok(
  $$insert into public.nova_post_zone_rates (zone) values ('A')$$,
  '42501', null, 'anon cannot add a zone'
);
delete from public.nova_post_zone_rates;
reset role;
select is(
  (select count(*)::int from public.nova_post_zone_rates where amount_minor is null),
  3,
  'anon update and delete change nothing'
);

-- Signed-in customer: reads, never writes ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000023c1", "role": "authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.nova_post_zone_rates), 3, 'a customer reads the zones');
update public.nova_post_zone_rates set amount_minor = 1, currency = 'EUR';
delete from public.nova_post_zone_rates;
select throws_ok(
  $$insert into public.nova_post_zone_rates (zone) values ('A')$$,
  '42501', null, 'a customer cannot add a zone'
);
reset role;
select is(
  (select count(*)::int from public.nova_post_zone_rates where amount_minor is null),
  3,
  'a customer update and delete change nothing'
);

-- Admin: sets a rate, attributed to themselves; still cannot add or remove a zone -----------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000023a1", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update public.nova_post_zone_rates set amount_minor = 1290, currency = 'EUR' where zone = 'A'$$,
  'an admin sets a zone rate'
);
select is(
  (select amount_minor from public.nova_post_zone_rates where zone = 'A'),
  1290,
  'the rate is stored'
);
select is(
  (select updated_by from public.nova_post_zone_rates where zone = 'A'),
  '00000000-0000-4000-8000-0000000023a1'::uuid,
  'the change is attributed to the admin'
);
select lives_ok(
  $$update public.nova_post_zone_rates set updated_by = '00000000-0000-4000-8000-0000000023c1' where zone = 'B'$$,
  'a spoofed updated_by is overwritten, not stored'
);
select is(
  (select updated_by from public.nova_post_zone_rates where zone = 'B'),
  '00000000-0000-4000-8000-0000000023a1'::uuid,
  'updated_by is the admin, never the spoofed user'
);
select throws_ok(
  $$insert into public.nova_post_zone_rates (zone) values ('A')$$,
  '42501', null, 'an admin cannot add a zone through the API'
);
delete from public.nova_post_zone_rates;
reset role;
select is((select count(*)::int from public.nova_post_zone_rates), 3, 'an admin delete removes no zone');

-- Revoked admin: loses write access ----------------------------------------------------------------------
update public.profiles set role = 'customer' where id = '00000000-0000-4000-8000-0000000023a1';
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000023a1", "role": "authenticated"}', true);
set local role authenticated;
update public.nova_post_zone_rates set amount_minor = 1, currency = 'EUR' where zone = 'A';
reset role;
select is(
  (select amount_minor from public.nova_post_zone_rates where zone = 'A'),
  1290,
  'a revoked admin cannot change a rate'
);
select is(
  (select count(*)::int from public.nova_post_zone_rates where zone in ('B', 'C') and amount_minor is null),
  2,
  'the other zones stay TBD'
);

select * from finish();
rollback;
