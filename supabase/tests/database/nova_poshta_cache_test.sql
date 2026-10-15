-- Nova Poshta dictionary cache: structure, constraints, server-only access (negative tests for anon and a
-- signed-in customer), and the prune of rows no lookup names.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000022c1', 'customer-' || gen_random_uuid() || '@example.test');

-- Structure -----------------------------------------------------------------------------------------------
select has_table('public', 'np_settlements', 'np_settlements exists');
select has_table('public', 'np_warehouses', 'np_warehouses exists');
select has_table('public', 'np_lookups', 'np_lookups exists');
select ok((select relrowsecurity from pg_class where oid = 'public.np_settlements'::regclass), 'RLS on np_settlements');
select ok((select relrowsecurity from pg_class where oid = 'public.np_warehouses'::regclass), 'RLS on np_warehouses');
select ok((select relrowsecurity from pg_class where oid = 'public.np_lookups'::regclass), 'RLS on np_lookups');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename like 'np\_%'),
  0,
  'no policy opens the cache to anon or authenticated'
);

-- Fixtures (as the owner): one settlement and one branch named by lookups, one of each named by none
insert into public.np_settlements (ref, city_ref, name, label) values
  ('e718a680-4b33-11e4-ab6d-005056801329', '8d5a980d-391c-11dd-90d9-001a92567626', 'Київ', 'м. Київ, Київська обл.'),
  ('0df25497-4b3a-11e4-ab6d-005056801329', '6dbe5985-96d1-11ea-a970-b8830365ade4', 'Київець', 'с. Київець');
insert into public.np_warehouses (ref, settlement_ref, city_ref, number, kind, type_ref, name) values
  ('1ec09d88-e1c2-11e3-8c4a-0050568002cf', 'e718a680-4b33-11e4-ab6d-005056801329', '8d5a980d-391c-11dd-90d9-001a92567626',
   1, 'branch', '9a68df70-0267-42a8-bb5c-37f427e36ee4', 'Відділення №1'),
  ('8e00619f-76b4-11eb-ac16-b8830365bd14', 'e718a680-4b33-11e4-ab6d-005056801329', '8d5a980d-391c-11dd-90d9-001a92567626',
   1001, 'postomat', 'f9316480-5f2d-425d-bc2c-ac7cd29decf0', 'Поштомат №1001');
insert into public.np_lookups (key, kind, params, refs) values
  ('settlements:київ', 'settlements', '{"kind":"settlements","query":"київ"}', array['e718a680-4b33-11e4-ab6d-005056801329']::uuid[]),
  ('warehouses:e718a680-4b33-11e4-ab6d-005056801329:branch:', 'warehouses',
   '{"kind":"warehouses","settlementRef":"e718a680-4b33-11e4-ab6d-005056801329","filter":"branch","query":""}',
   array['1ec09d88-e1c2-11e3-8c4a-0050568002cf']::uuid[]);

-- Constraints -------------------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.np_warehouses (ref, settlement_ref, city_ref, number, kind, type_ref, name)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 2, 'dropoff', gen_random_uuid(), 'Пункт')$$,
  '23514', null, 'a warehouse is a branch or a postomat'
);
select throws_ok(
  $$insert into public.np_lookups (key, kind, params, refs) values ('streets:x', 'streets', '{}', '{}')$$,
  '23514', null, 'a lookup is of settlements or warehouses'
);
select throws_ok(
  $$insert into public.np_settlements (ref, city_ref, name, label) values (gen_random_uuid(), gen_random_uuid(), '', 'x')$$,
  '23514', null, 'a settlement has a name'
);

-- Anonymous visitor: no access at all -----------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from public.np_settlements', '42501', null, 'anon cannot read settlements');
select throws_ok('select count(*) from public.np_warehouses', '42501', null, 'anon cannot read warehouses');
select throws_ok('select count(*) from public.np_lookups', '42501', null, 'anon cannot read lookups');
select throws_ok(
  $$insert into public.np_lookups (key, kind, params, refs) values ('settlements:spoof', 'settlements', '{}', '{}')$$,
  '42501', null, 'anon cannot add a lookup'
);
select throws_ok(
  $$update public.np_warehouses set name = 'spoofed'$$,
  '42501', null, 'anon cannot change a warehouse'
);
select throws_ok('select public.np_prune_dictionary()', '42501', null, 'anon cannot run the prune');
reset role;

-- Signed-in customer: no access either ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000022c1", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok('select count(*) from public.np_settlements', '42501', null, 'a customer cannot read settlements');
select throws_ok('select count(*) from public.np_lookups', '42501', null, 'a customer cannot read lookups');
select throws_ok(
  $$insert into public.np_settlements (ref, city_ref, name, label) values (gen_random_uuid(), gen_random_uuid(), 'X', 'X')$$,
  '42501', null, 'a customer cannot add a settlement'
);
select throws_ok('delete from public.np_warehouses', '42501', null, 'a customer cannot delete warehouses');
select throws_ok('select public.np_prune_dictionary()', '42501', null, 'a customer cannot run the prune');
reset role;
select is((select count(*)::int from public.np_warehouses where name = 'spoofed'), 0, 'nothing was changed by them');

-- The server (service role) ---------------------------------------------------------------------------------
set local role service_role;
select is((select count(*)::int from public.np_lookups), 2, 'the service role reads the lookups');
select lives_ok(
  $$insert into public.np_lookups (key, kind, params, refs) values ('settlements:львів', 'settlements', '{"kind":"settlements","query":"львів"}', '{}')$$,
  'the service role writes a lookup'
);
select results_eq(
  'select settlements, warehouses from public.np_prune_dictionary()',
  $$values (1, 1)$$,
  'the prune removes the settlement and the postomat no lookup names'
);
select results_eq(
  'select ref::text from public.np_settlements',
  $$values ('e718a680-4b33-11e4-ab6d-005056801329')$$,
  'the named settlement stays'
);
select results_eq(
  'select number from public.np_warehouses',
  $$values (1)$$,
  'the named branch stays'
);
select results_eq(
  'select settlements, warehouses from public.np_prune_dictionary()',
  $$values (0, 0)$$,
  'a second prune finds nothing'
);
reset role;

select * from finish();
rollback;
