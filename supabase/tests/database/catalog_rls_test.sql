-- Catalog RLS: everyone reads categories and available products with their translations and images;
-- unavailable products are visible to admins only; only admins insert, update and delete.
begin;
create extension if not exists pgtap with schema extensions;
select plan(84);

-- Fixtures (as the database owner) -------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222222';

insert into public.categories (id, slug, position) values
  ('c1000000-0000-4000-8000-000000000001', 'test-category', 100);
insert into public.category_translations (category_id, locale, name) values
  ('c1000000-0000-4000-8000-000000000001', 'en', 'Test category');
insert into public.products (id, category_id, price_usd, available) values
  ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 10.00, true),
  ('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 20.00, false);
insert into public.product_translations (product_id, locale, slug, title) values
  ('b1000000-0000-4000-8000-000000000001', 'en', 'test-available', 'Available'),
  ('b1000000-0000-4000-8000-000000000002', 'en', 'test-hidden', 'Hidden');
insert into public.product_images (id, product_id, storage_path) values
  ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'test/available.jpg'),
  ('e1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'test/hidden.jpg');
insert into public.product_image_alts (image_id, locale, alt) values
  ('e1000000-0000-4000-8000-000000000001', 'en', 'Available alt'),
  ('e1000000-0000-4000-8000-000000000002', 'en', 'Hidden alt');

-- One write of each kind per table, aimed at the fixtures.
create temp table writes (tbl text, kind text, stmt text) on commit drop;
insert into writes values
  ('categories', 'insert', $$insert into public.categories (slug) values ('intruder')$$),
  ('categories', 'update', $$update public.categories set position = 0 where id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('categories', 'delete', $$delete from public.categories where id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('category_translations', 'insert', $$insert into public.category_translations (category_id, locale, name) values ('c1000000-0000-4000-8000-000000000001', 'fr', 'Intrus')$$),
  ('category_translations', 'update', $$update public.category_translations set name = 'Hacked' where category_id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('category_translations', 'delete', $$delete from public.category_translations where category_id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('products', 'insert', $$insert into public.products (category_id, price_usd) values ('c1000000-0000-4000-8000-000000000001', 1)$$),
  ('products', 'update', $$update public.products set price_usd = 0, available = true where category_id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('products', 'delete', $$delete from public.products where category_id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('product_translations', 'insert', $$insert into public.product_translations (product_id, locale, slug, title) values ('b1000000-0000-4000-8000-000000000001', 'fr', 'intrus', 'Intrus')$$),
  ('product_translations', 'update', $$update public.product_translations set title = 'Hacked' where product_id = 'b1000000-0000-4000-8000-000000000001'$$),
  ('product_translations', 'delete', $$delete from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000001'$$),
  ('product_images', 'insert', $$insert into public.product_images (product_id, storage_path) values ('b1000000-0000-4000-8000-000000000001', 'test/intruder.jpg')$$),
  ('product_images', 'update', $$update public.product_images set storage_path = 'test/hacked.jpg' where id = 'e1000000-0000-4000-8000-000000000001'$$),
  ('product_images', 'delete', $$delete from public.product_images where id = 'e1000000-0000-4000-8000-000000000001'$$),
  ('product_image_alts', 'insert', $$insert into public.product_image_alts (image_id, locale, alt) values ('e1000000-0000-4000-8000-000000000001', 'fr', 'Intrus')$$),
  ('product_image_alts', 'update', $$update public.product_image_alts set alt = 'Hacked' where image_id = 'e1000000-0000-4000-8000-000000000001'$$),
  ('product_image_alts', 'delete', $$delete from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001'$$);
grant select on writes to anon, authenticated;

-- A fingerprint of every fixture row; it must not change after the refused writes.
create function pg_temp.fixture_state() returns text language sql as $$
  select concat_ws('|',
    (select string_agg(concat(slug, position), ',' order by slug) from public.categories where slug in ('test-category', 'intruder')),
    (select string_agg(concat(locale, name), ',' order by locale) from public.category_translations where category_id = 'c1000000-0000-4000-8000-000000000001'),
    (select string_agg(concat(id, price_usd, available), ',' order by id) from public.products where category_id = 'c1000000-0000-4000-8000-000000000001'),
    (select string_agg(concat(locale, slug, title), ',' order by product_id, locale) from public.product_translations where product_id in ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002')),
    (select string_agg(concat(id, storage_path), ',' order by id) from public.product_images where product_id in ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002')),
    (select string_agg(concat(locale, alt), ',' order by image_id, locale) from public.product_image_alts where image_id in ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002'))
  );
$$;
grant execute on function pg_temp.fixture_state() to anon, authenticated;
create temp table baseline on commit drop as select pg_temp.fixture_state() as state;

-- RLS everywhere ------------------------------------------------------------------------------------
select is_empty(
  $$select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity$$,
  'RLS is enabled on every table in public'
);

-- Anon -------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select ok(exists (select 1 from public.categories where id = 'c1000000-0000-4000-8000-000000000001'), 'anon reads categories');
select ok(exists (select 1 from public.category_translations where category_id = 'c1000000-0000-4000-8000-000000000001'), 'anon reads category translations');
select ok(exists (select 1 from public.products where id = 'b1000000-0000-4000-8000-000000000001'), 'anon reads an available product');
select ok(exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000001'), 'anon reads its translations');
select ok(exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000001'), 'anon reads its images');
select ok(exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001'), 'anon reads its image alts');
select ok(not exists (select 1 from public.products where id = 'b1000000-0000-4000-8000-000000000002'), 'anon does not see an unavailable product');
select ok(not exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000002'), 'anon does not see its translations');
select ok(not exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000002'), 'anon does not see its images');
select ok(not exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000002'), 'anon does not see its image alts');

-- Anon holds no write privilege at all: every write is refused with 42501.
select throws_ok(stmt, '42501', null, format('anon cannot %s %s', kind, tbl)) from writes order by tbl, kind;

reset role;
select is(pg_temp.fixture_state(), (select state from baseline), 'anon writes changed nothing');

-- Customer ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select ok(exists (select 1 from public.products where id = 'b1000000-0000-4000-8000-000000000001'), 'a customer reads an available product');
select ok(exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001'), 'a customer reads its image alts');
select ok(not exists (select 1 from public.products where id = 'b1000000-0000-4000-8000-000000000002'), 'a customer does not see an unavailable product');
select ok(not exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000002'), 'a customer does not see its translations');
select ok(not exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000002'), 'a customer does not see its images');
select ok(not exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000002'), 'a customer does not see its image alts');

-- Inserts violate the admin-only WITH CHECK (42501); updates and deletes match no row under RLS.
select throws_ok(stmt, '42501', null, format('a customer cannot insert into %s', tbl)) from writes where kind = 'insert' order by tbl;
select lives_ok(stmt, format('a customer''s %s on %s is filtered by RLS', kind, tbl)) from writes where kind <> 'insert' order by tbl, kind;

reset role;
select is(pg_temp.fixture_state(), (select state from baseline), 'customer writes changed nothing');

-- Admin ------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select ok(exists (select 1 from public.products where id = 'b1000000-0000-4000-8000-000000000002'), 'an admin sees an unavailable product');
select ok(exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000002'), 'an admin sees its translations');
select ok(exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000002'), 'an admin sees its images');
select ok(exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000002'), 'an admin sees its image alts');

select lives_ok(stmt, format('an admin can %s %s', kind, tbl)) from writes where kind = 'insert' order by tbl;
select lives_ok(stmt, format('an admin can %s %s', kind, tbl)) from writes where kind = 'update' order by tbl;

select is((select position from public.categories where id = 'c1000000-0000-4000-8000-000000000001'), 0, 'the admin update of categories took effect');
select is((select count(*)::int from public.category_translations where category_id = 'c1000000-0000-4000-8000-000000000001' and name = 'Hacked'), 2, 'the admin update of category translations took effect');
select is((select count(*)::int from public.products where category_id = 'c1000000-0000-4000-8000-000000000001' and price_usd = 0), 3, 'the admin update of products took effect');
select is((select title from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000001' and locale = 'en'), 'Hacked', 'the admin update of product translations took effect');
select is((select storage_path from public.product_images where id = 'e1000000-0000-4000-8000-000000000001'), 'test/hacked.jpg', 'the admin update of product images took effect');
select is((select count(*)::int from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001' and alt = 'Hacked'), 2, 'the admin update of image alts took effect');

-- Children first; the category goes last (products restrict its deletion).
select lives_ok(stmt, format('an admin can delete from %s', tbl)) from writes where kind = 'delete'
  order by array_position(array['product_image_alts', 'product_images', 'product_translations', 'products', 'category_translations', 'categories'], tbl);

select ok(not exists (select 1 from public.categories where id = 'c1000000-0000-4000-8000-000000000001'), 'the admin deletes took effect');

reset role;

select * from finish();
rollback;
