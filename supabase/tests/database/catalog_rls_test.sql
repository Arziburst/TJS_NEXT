-- Catalog RLS: everyone reads categories and published, not deleted products (sold pieces included) with
-- their translations and images; drafts, archived and deleted products are visible to admins only; only
-- admins insert, update and delete, and the audit columns name the caller.
begin;
create extension if not exists pgtap with schema extensions;
select plan(109);

-- Fixtures (as the database owner) -------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222222';

insert into public.categories (id, slug, position) values
  ('c1000000-0000-4000-8000-000000000001', 'test-category', 100);
insert into public.category_translations (category_id, locale, name) values
  ('c1000000-0000-4000-8000-000000000001', 'en', 'Test category');
insert into public.products (id, category_id, status, fulfillment, availability, price_usd, deleted_at) values
  ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'published', 'made_to_order', 'available', 10, null),
  ('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'draft', 'made_to_order', 'available', 20, null),
  ('b1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'archived', 'made_to_order', 'available', 30, null),
  ('b1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'published', 'made_to_order', 'available', 40, now()),
  ('b1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000001', 'published', 'one_of_a_kind', 'sold', 50, null),
  ('b1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000001', 'published', 'one_of_a_kind', 'available', 60, null);
insert into public.product_translations (product_id, locale, slug, title, description) values
  ('b1000000-0000-4000-8000-000000000001', 'en', 'test-published', 'Published rings', 'Hammered silver-tone rings'),
  ('b1000000-0000-4000-8000-000000000002', 'en', 'test-draft', 'Draft', null);
insert into public.product_images (id, product_id, storage_path, width, height) values
  ('e1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'test/published.jpg', 800, 1000),
  ('e1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'test/draft.jpg', 800, 1000);
insert into public.product_image_alts (image_id, locale, alt) values
  ('e1000000-0000-4000-8000-000000000001', 'en', 'Published alt'),
  ('e1000000-0000-4000-8000-000000000002', 'en', 'Draft alt');

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
  ('products', 'update', $$update public.products set price_usd = 0, status = 'published', deleted_at = null where category_id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('products', 'delete', $$delete from public.products where category_id = 'c1000000-0000-4000-8000-000000000001'$$),
  ('product_translations', 'insert', $$insert into public.product_translations (product_id, locale, slug, title) values ('b1000000-0000-4000-8000-000000000001', 'fr', 'intrus', 'Intrus')$$),
  ('product_translations', 'update', $$update public.product_translations set title = 'Hacked' where product_id = 'b1000000-0000-4000-8000-000000000001'$$),
  ('product_translations', 'delete', $$delete from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000001'$$),
  ('product_images', 'insert', $$insert into public.product_images (product_id, storage_path, width, height) values ('b1000000-0000-4000-8000-000000000001', 'test/intruder.jpg', 10, 10)$$),
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
    (select string_agg(concat(id, price_usd, status, deleted_at), ',' order by id) from public.products where category_id = 'c1000000-0000-4000-8000-000000000001'),
    (select string_agg(concat(locale, slug, title), ',' order by product_id, locale) from public.product_translations where product_id::text like 'b1000000-%'),
    (select string_agg(concat(id, storage_path), ',' order by id) from public.product_images where product_id::text like 'b1000000-%'),
    (select string_agg(concat(locale, alt), ',' order by image_id, locale) from public.product_image_alts where image_id::text like 'e1000000-%')
  );
$$;
grant execute on function pg_temp.fixture_state() to anon, authenticated;
create temp table baseline on commit drop as select pg_temp.fixture_state() as state;

-- Which fixture products a role sees.
create function pg_temp.visible_products() returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}') from public.products where category_id = 'c1000000-0000-4000-8000-000000000001';
$$;
grant execute on function pg_temp.visible_products() to anon, authenticated;

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
select is(
  pg_temp.visible_products(),
  array['b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000006']::uuid[],
  'anon sees published products incl. a sold piece; not drafts, archived or deleted ones'
);
select ok(exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000001'), 'anon reads translations of a published product');
select ok(exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000001'), 'anon reads its images');
select ok(exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001'), 'anon reads its image alts');
select ok(not exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000002'), 'anon does not see translations of a draft');
select ok(not exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000002'), 'anon does not see images of a draft');
select ok(not exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000002'), 'anon does not see image alts of a draft');

-- Anon holds no write privilege at all: every write is refused with 42501.
select throws_ok(stmt, '42501', null, format('anon cannot %s %s', kind, tbl)) from writes order by tbl, kind;
select throws_ok(
  $$select private.mark_one_of_a_kind_sold('b1000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'anon cannot call the availability functions'
);

reset role;
select is(pg_temp.fixture_state(), (select state from baseline), 'anon writes changed nothing');

-- Customer ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is(
  pg_temp.visible_products(),
  array['b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000006']::uuid[],
  'a customer sees the same products as anon'
);
select ok(exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001'), 'a customer reads image alts of a published product');
select ok(not exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000002'), 'a customer does not see translations of a draft');
select ok(not exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000002'), 'a customer does not see images of a draft');
select ok(not exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000002'), 'a customer does not see image alts of a draft');

-- Inserts violate the admin-only WITH CHECK (42501); updates and deletes match no row under RLS.
select throws_ok(stmt, '42501', null, format('a customer cannot insert into %s', tbl)) from writes where kind = 'insert' order by tbl;
select lives_ok(stmt, format('a customer''s %s on %s is filtered by RLS', kind, tbl)) from writes where kind <> 'insert' order by tbl, kind;
select throws_ok(
  $$select private.reserve_one_of_a_kind('b1000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'a customer cannot call the availability functions'
);

reset role;
select is(pg_temp.fixture_state(), (select state from baseline), 'customer writes changed nothing');

-- Admin ------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is(cardinality(pg_temp.visible_products()), 6, 'an admin sees every product, drafts, archived and deleted ones included');
select ok(exists (select 1 from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000002'), 'an admin sees translations of a draft');
select ok(exists (select 1 from public.product_images where id = 'e1000000-0000-4000-8000-000000000002'), 'an admin sees images of a draft');
select ok(exists (select 1 from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000002'), 'an admin sees image alts of a draft');

-- Attribution cannot be spoofed: the audit trigger writes the caller.
select lives_ok(
  $$insert into public.products (id, category_id, price_usd, created_by, updated_by)
    values ('b1000000-0000-4000-8000-000000000099', 'c1000000-0000-4000-8000-000000000001', 5,
            '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111')$$,
  'an admin inserts a product claiming another author'
);
select is(
  (select array[created_by, updated_by] from public.products where id = 'b1000000-0000-4000-8000-000000000099'),
  array['22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222']::uuid[],
  'created_by and updated_by name the admin, not the claimed author'
);
select lives_ok(
  $$update public.products set updated_by = '11111111-1111-4111-8111-111111111111', created_by = null
    where id = 'b1000000-0000-4000-8000-000000000099'$$,
  'an admin updates a product claiming another editor'
);
select is(
  (select array[created_by, updated_by] from public.products where id = 'b1000000-0000-4000-8000-000000000099'),
  array['22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222']::uuid[],
  'created_by is kept and updated_by names the admin'
);
select is(
  (select status::text from public.products where id = 'b1000000-0000-4000-8000-000000000099'),
  'draft',
  'a new product starts as a draft'
);
delete from public.products where id = 'b1000000-0000-4000-8000-000000000099';

select lives_ok(stmt, format('an admin can %s %s', kind, tbl)) from writes where kind = 'insert' order by tbl;
select lives_ok(stmt, format('an admin can %s %s', kind, tbl)) from writes where kind = 'update' order by tbl;

select is((select position from public.categories where id = 'c1000000-0000-4000-8000-000000000001'), 0, 'the admin update of categories took effect');
select is((select count(*)::int from public.category_translations where category_id = 'c1000000-0000-4000-8000-000000000001' and name = 'Hacked'), 2, 'the admin update of category translations took effect');
select is((select count(*)::int from public.products where category_id = 'c1000000-0000-4000-8000-000000000001' and price_usd = 0), 7, 'the admin update of products took effect');
select is((select title from public.product_translations where product_id = 'b1000000-0000-4000-8000-000000000001' and locale = 'en'), 'Hacked', 'the admin update of product translations took effect');
select is((select storage_path from public.product_images where id = 'e1000000-0000-4000-8000-000000000001'), 'test/hacked.jpg', 'the admin update of product images took effect');
select is((select count(*)::int from public.product_image_alts where image_id = 'e1000000-0000-4000-8000-000000000001' and alt = 'Hacked'), 2, 'the admin update of image alts took effect');

-- Children first; the category goes last (products restrict its deletion).
select lives_ok(stmt, format('an admin can delete from %s', tbl)) from writes where kind = 'delete'
  order by array_position(array['product_image_alts', 'product_images', 'product_translations', 'products', 'category_translations', 'categories'], tbl);
select ok(not exists (select 1 from public.categories where id = 'c1000000-0000-4000-8000-000000000001'), 'the admin deletes took effect');

reset role;

-- Model rules (as the owner) ---------------------------------------------------------------------------
insert into public.categories (id, slug) values ('c2000000-0000-4000-8000-000000000001', 'rules-category');
insert into public.products (id, category_id, status, fulfillment, price_usd) values
  ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'published', 'one_of_a_kind', 10),
  ('b2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'published', 'made_to_order', 10);

select throws_ok(
  $$update public.products set availability = 'sold' where id = 'b2000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'a made-to-order product cannot be sold out'
);
select throws_ok(
  $$update public.products set lead_time_days = 7 where id = 'b2000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a one-of-a-kind piece has no lead time'
);
select throws_ok(
  $$update public.products set lead_time_days = 0 where id = 'b2000000-0000-4000-8000-000000000002'$$,
  '23514', null, 'a lead time is positive'
);
select throws_ok(
  $$insert into public.products (category_id, price_usd) values ('c2000000-0000-4000-8000-000000000001', -1)$$,
  '23514', null, 'a price cannot be negative'
);
select throws_ok(
  $$insert into public.product_translations (product_id, locale, slug, title) values ('b2000000-0000-4000-8000-000000000001', 'ru', 'x', 'X')$$,
  '23514', null, 'a locale outside D3 is refused'
);
insert into public.product_translations (product_id, locale, slug, title) values
  ('b2000000-0000-4000-8000-000000000001', 'en', 'rules-slug', 'Rules');
select throws_ok(
  $$insert into public.product_translations (product_id, locale, slug, title) values ('b2000000-0000-4000-8000-000000000002', 'en', 'rules-slug', 'Rules 2')$$,
  '23505', null, 'a slug is unique per locale'
);
select lives_ok(
  $$insert into public.product_translations (product_id, locale, slug, title) values ('b2000000-0000-4000-8000-000000000002', 'uk', 'rules-slug', 'Rules 2')$$,
  'the same slug may be used in another locale'
);
select throws_ok(
  $$insert into public.products (category_id, price_usd, sku) values ('c2000000-0000-4000-8000-000000000001', 1, 'DUP'), ('c2000000-0000-4000-8000-000000000001', 1, 'DUP')$$,
  '23505', null, 'a SKU is unique'
);
select isnt(
  (select published_at from public.products where id = 'b2000000-0000-4000-8000-000000000001'),
  null,
  'published_at is set on publication'
);
update public.products set updated_at = '2000-01-01' where id = 'b2000000-0000-4000-8000-000000000001';
select is(
  (select updated_at from public.products where id = 'b2000000-0000-4000-8000-000000000001'),
  now(),
  'updated_at is maintained by the trigger'
);
select ok(
  (select search_vector @@ to_tsquery('english', 'rule') from public.product_translations
   where product_id = 'b2000000-0000-4000-8000-000000000001' and locale = 'en'),
  'search_vector of an en translation is stemmed in English ("Rules" matches "rule")'
);
select ok(
  not (select search_vector @@ to_tsquery('simple', 'rule') from public.product_translations
       where product_id = 'b2000000-0000-4000-8000-000000000002' and locale = 'uk'),
  'search_vector of a uk translation uses the simple configuration'
);

-- One-of-a-kind availability transitions
select is(private.reserve_one_of_a_kind('b2000000-0000-4000-8000-000000000001'), true, 'an available piece can be reserved');
select is(private.reserve_one_of_a_kind('b2000000-0000-4000-8000-000000000001'), false, 'a reserved piece cannot be reserved twice');
select is(private.release_one_of_a_kind('b2000000-0000-4000-8000-000000000001'), true, 'a reservation can be released');
select is(private.mark_one_of_a_kind_sold('b2000000-0000-4000-8000-000000000001'), true, 'an available piece can be sold');
select is(private.mark_one_of_a_kind_sold('b2000000-0000-4000-8000-000000000001'), false, 'a sold piece cannot be sold again');
select is(private.reserve_one_of_a_kind('b2000000-0000-4000-8000-000000000001'), false, 'a sold piece cannot be reserved');
select is(private.reserve_one_of_a_kind('b2000000-0000-4000-8000-000000000002'), false, 'a made-to-order product is never reserved');
select is(
  (select availability::text from public.products where id = 'b2000000-0000-4000-8000-000000000001'),
  'sold',
  'the piece ends up sold'
);

select * from finish();
rollback;
