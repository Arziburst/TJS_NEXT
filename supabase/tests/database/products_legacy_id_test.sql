-- products.legacy_id (the legacy ObjectId of an imported product): hidden from the Data API roles, readable by
-- the service role the importer uses, unique and a 24-hex ObjectId.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111169', 'customer-' || gen_random_uuid() || '@example.test');

insert into public.categories (id, slug) values ('c6900000-0000-4000-8000-000000000001', 'legacy-id-category');
insert into public.products (id, category_id, status, price_usd, legacy_id) values
  ('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'published', 10,
   'f69f69f69f69f69f69f69f69');

select has_column('public', 'products', 'legacy_id', 'products has legacy_id');

select throws_ok(
  $$insert into public.products (category_id, price_usd, legacy_id)
    values ('c6900000-0000-4000-8000-000000000001', 1, 'f69f69f69f69f69f69f69f69')$$,
  '23505', null, 'a legacy id is imported once');
select throws_ok(
  $$insert into public.products (category_id, price_usd, legacy_id)
    values ('c6900000-0000-4000-8000-000000000001', 1, 'not-an-object-id')$$,
  '23514', null, 'a legacy id is a 24-hex ObjectId');

-- Anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select legacy_id from public.products$$, '42501', null, 'anon cannot read legacy_id');
select isnt_empty(
  $$select id from public.products where id = 'b6900000-0000-4000-8000-000000000001'$$,
  'anon still reads the published product');
reset role;

-- Customer
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111169","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select legacy_id from public.products$$, '42501', null, 'a customer cannot read legacy_id');
select throws_ok(
  $$select id from public.products where legacy_id = 'f69f69f69f69f69f69f69f69'$$,
  '42501', null, 'a customer cannot filter on legacy_id');
reset role;

-- Service role (the importer)
set local role service_role;
select is(
  (select legacy_id from public.products where id = 'b6900000-0000-4000-8000-000000000001'),
  'f69f69f69f69f69f69f69f69', 'the service role reads legacy_id');
select is(
  (select id from public.products where legacy_id = 'f69f69f69f69f69f69f69f69'),
  'b6900000-0000-4000-8000-000000000001'::uuid, 'the service role finds a product by its legacy id');
reset role;

select * from finish();
rollback;
