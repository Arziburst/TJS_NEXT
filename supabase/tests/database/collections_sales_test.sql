-- #67: collections and sales. The public reads published collections, their translations and published pieces, and
-- only the sales running now; only admins write. The sale price of a product and of its sizes (percentage rounded to
-- the cent, a fixed price with the size's difference kept, the time window, the lowest of several sales, never below
-- 1 cent), the listing's price filter and sort by it, a collection's listing in the owner's order, and the order
-- lines' regular prices.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

insert into auth.users (id, email) values
  ('67111111-1111-4111-8111-111111111111', 'collections-customer-' || gen_random_uuid() || '@example.test'),
  ('67222222-2222-4222-8222-222222222222', 'collections-admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '67222222-2222-4222-8222-222222222222';

-- P1 a ring at $20.00 with sizes +$0 and +$2.50, P2 a ring at $10.00, P3 a draft ring at $30.00, P4 a ring at $0.40
insert into public.products (id, category_id, sku, status, fulfillment, price_usd, created_at)
select p.id::uuid, c.id, p.sku, p.status::public.product_status, 'made_to_order', p.price, now() - p.age * interval '1 day'
from (values
  ('a6700000-0000-4000-8000-000000000001', 'PGTAP-67-1', 'published', 20.00, 3),
  ('a6700000-0000-4000-8000-000000000002', 'PGTAP-67-2', 'published', 10.00, 2),
  ('a6700000-0000-4000-8000-000000000003', 'PGTAP-67-3', 'draft', 30.00, 1),
  ('a6700000-0000-4000-8000-000000000004', 'PGTAP-67-4', 'published', 0.40, 4)
) as p (id, sku, status, price, age)
join public.categories c on c.slug = 'rings';
insert into public.product_translations (product_id, locale, slug, title) values
  ('a6700000-0000-4000-8000-000000000001', 'en', 'pgtap-67-ring-1', 'PGTAP 67 ring 1'),
  ('a6700000-0000-4000-8000-000000000002', 'en', 'pgtap-67-ring-2', 'PGTAP 67 ring 2'),
  ('a6700000-0000-4000-8000-000000000003', 'en', 'pgtap-67-ring-3', 'PGTAP 67 ring 3'),
  ('a6700000-0000-4000-8000-000000000004', 'en', 'pgtap-67-ring-4', 'PGTAP 67 ring 4');
insert into public.product_variants (id, product_id, price_delta_usd_minor, position) values
  ('c6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000001', 0, 0),
  ('c6700000-0000-4000-8000-000000000002', 'a6700000-0000-4000-8000-000000000001', 250, 1);
insert into public.product_variant_translations (variant_id, locale, label) values
  ('c6700000-0000-4000-8000-000000000001', 'uk', '16'),
  ('c6700000-0000-4000-8000-000000000002', 'uk', '18');

-- C1 published («Весна»: P2 first, then P1 and the draft P3), C2 a draft collection with P1
insert into public.collections (id, is_published, position) values
  ('d6700000-0000-4000-8000-000000000001', true, 0),
  ('d6700000-0000-4000-8000-000000000002', false, 1);
insert into public.collection_translations (collection_id, locale, slug, name) values
  ('d6700000-0000-4000-8000-000000000001', 'uk', 'vesna', 'Весна'),
  ('d6700000-0000-4000-8000-000000000001', 'en', 'spring', 'Spring'),
  ('d6700000-0000-4000-8000-000000000002', 'uk', 'chernetka', 'Чернетка');
insert into public.collection_products (collection_id, product_id, position) values
  ('d6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000002', 0),
  ('d6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000001', 1),
  ('d6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000003', 2),
  ('d6700000-0000-4000-8000-000000000002', 'a6700000-0000-4000-8000-000000000001', 0);

select is((select relrowsecurity from pg_class where oid = 'public.collections'::regclass), true, 'RLS is enabled on collections');
select is((select relrowsecurity from pg_class where oid = 'public.collection_translations'::regclass), true, 'RLS is enabled on collection_translations');
select is((select relrowsecurity from pg_class where oid = 'public.collection_products'::regclass), true, 'RLS is enabled on collection_products');
select is((select relrowsecurity from pg_class where oid = 'public.product_sales'::regclass), true, 'RLS is enabled on product_sales');
select is((select relrowsecurity from pg_class where oid = 'public.collection_sales'::regclass), true, 'RLS is enabled on collection_sales');

-- The rules -----------------------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.product_sales (product_id) values ('a6700000-0000-4000-8000-000000000002')$$,
  '23514', null, 'a sale is a percentage or a price'
);
select throws_ok(
  $$insert into public.product_sales (product_id, percent_off, price_usd_minor) values ('a6700000-0000-4000-8000-000000000002', 10, 500)$$,
  '23514', null, 'a sale is not both a percentage and a price'
);
select throws_ok(
  $$insert into public.product_sales (product_id, percent_off) values ('a6700000-0000-4000-8000-000000000002', 100)$$,
  '23514', null, 'a sale of 100 % is refused'
);
select throws_ok(
  $$insert into public.product_sales (product_id, percent_off, starts_at, ends_at)
    values ('a6700000-0000-4000-8000-000000000002', 10, now(), now() - interval '1 hour')$$,
  '23514', null, 'a sale ends after it starts'
);
select throws_ok(
  $$insert into public.collection_translations (collection_id, locale, slug, name)
    values ('d6700000-0000-4000-8000-000000000002', 'uk', 'vesna', 'Друга весна')$$,
  '23505', null, 'a slug is one collection''s per locale'
);

-- The sale price (as the table owner, at fixed times) -------------------------------------------------------------
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000002', 1000, 0, now()), 1000::bigint, 'no sale: the regular price');
insert into public.product_sales (product_id, percent_off, starts_at, ends_at)
values ('a6700000-0000-4000-8000-000000000001', 15, now() + interval '1 day', now() + interval '2 days');
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000001', 2000, 0, now()), 2000::bigint, 'a sale that has not started does not apply');
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000001', 2000, 0, now() + interval '1 day'), 1700::bigint, 'it applies from its start');
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000001', 2000, 250, now() + interval '36 hours'), 1913::bigint,
  'a percentage of a size''s price, rounded to the cent half up (2250 × 0.85 = 1912.5)');
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000001', 2000, 0, now() + interval '2 days'), 2000::bigint, 'it ends at its end');
update public.product_sales set percent_off = null, price_usd_minor = 1500, starts_at = null, ends_at = null
where product_id = 'a6700000-0000-4000-8000-000000000001';
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000001', 2000, 250, now()), 1750::bigint, 'a fixed sale price keeps the size''s difference');
insert into public.collection_sales (collection_id, percent_off) values ('d6700000-0000-4000-8000-000000000001', 30);
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000001', 2000, 0, now()), 1400::bigint, 'the lowest of the product''s and its collection''s sales wins');
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000002', 1000, 0, now()), 700::bigint, 'a collection''s sale applies to its pieces');
update public.collections set is_published = false where id = 'd6700000-0000-4000-8000-000000000001';
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000002', 1000, 0, now()), 1000::bigint, 'an unpublished collection''s sale does not apply');
update public.collections set is_published = true where id = 'd6700000-0000-4000-8000-000000000001';
insert into public.product_sales (product_id, price_usd_minor) values ('a6700000-0000-4000-8000-000000000004', 5000);
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000004', 40, 0, now()), 40::bigint, 'a sale price above the regular price changes nothing');
update public.product_sales set price_usd_minor = 1 where product_id = 'a6700000-0000-4000-8000-000000000004';
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000004', 40, -39, now()), 1::bigint, 'never below 1 cent');
select is(private.sale_price_minor('a6700000-0000-4000-8000-000000000004', 0, 0, now()), 0::bigint, 'a free piece stays free');
delete from public.product_sales where product_id = 'a6700000-0000-4000-8000-000000000004';
select ok(public.next_sale_change() is null, 'no sale starts or ends later: no next change');
update public.collection_sales set ends_at = now() + interval '3 hours';
select is(public.next_sale_change(), now() + interval '3 hours', 'the next change is the earliest start or end ahead');

-- The listing: P1 $14.00 (C1 30 %: its lowest size 20.00 × 0.7), P2 $7.00 (C1 30 %), P4 $0.40 ------------------------
select is(
  (select 'a6700000-0000-4000-8000-000000000001'::uuid = any (ids)
   from public.shop_search('en', 'rings', p_price_min_minor => 1400, p_price_max_minor => 1400)),
  true, 'the price filter uses the sale price'
);
select is(
  (select 'a6700000-0000-4000-8000-000000000001'::uuid = any (ids)
   from public.shop_search('en', 'rings', p_price_min_minor => 2000, p_price_max_minor => 2000)),
  false, 'the regular price no longer matches'
);
select is(
  (select ids from public.shop_search('en', p_collection => 'd6700000-0000-4000-8000-000000000001', p_sort => 'position')),
  array['a6700000-0000-4000-8000-000000000002', 'a6700000-0000-4000-8000-000000000001']::uuid[],
  'a collection lists its published pieces in the owner''s order'
);
select is(
  (select ids from public.shop_search('en', p_collection => 'd6700000-0000-4000-8000-000000000001', p_sort => 'price_desc')),
  array['a6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000002']::uuid[],
  'and by sale price on request'
);
select is(
  (select total from public.shop_search('en', p_collection => 'd6700000-0000-4000-8000-000000000002')),
  0::bigint, 'an unpublished collection lists nothing'
);
select is(
  (select count::int from public.shop_facets('en', p_collection => 'd6700000-0000-4000-8000-000000000001') where facet = 'availability'),
  2, 'the counts follow the collection'
);

-- anon -----------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq(
  $$select id from public.collections where id::text like 'd67%' order by id$$,
  $$values ('d6700000-0000-4000-8000-000000000001'::uuid)$$,
  'anon reads published collections only'
);
select is((select count(*)::int from public.collection_translations where collection_id = 'd6700000-0000-4000-8000-000000000002'), 0,
  'the translations of a draft collection are hidden');
select results_eq(
  $$select product_id from public.collection_products where collection_id::text like 'd67%' order by position$$,
  $$values ('a6700000-0000-4000-8000-000000000002'::uuid), ('a6700000-0000-4000-8000-000000000001'::uuid)$$,
  'anon reads the published pieces of published collections (no draft piece, nothing of a draft collection)'
);
select is((select count(*)::int from public.collection_sales), 1, 'anon reads the running sale of a published collection');
select throws_ok($$select created_by from public.collections$$, '42501', null, 'anon cannot read who created a collection');
select throws_ok($$insert into public.collections (is_published) values (true)$$, '42501', null, 'anon cannot add a collection');
select throws_ok(
  $$insert into public.product_sales (product_id, percent_off) values ('a6700000-0000-4000-8000-000000000002', 50)$$,
  '42501', null, 'anon cannot start a sale'
);
select throws_ok($$select private.sale_price_minor(null, 1, 0, now())$$, '42501', null, 'anon cannot call the private price helper');
select throws_ok(
  $$select public.admin_save_collection(null, '{"is_published":false}', '[{"locale":"uk","slug":"x","name":"X"}]')$$,
  '42501', null, 'anon cannot execute admin_save_collection'
);
reset role;

-- A sale planned or ended is not public; a sale of a draft product neither
update public.product_sales set starts_at = now() + interval '1 hour' where product_id = 'a6700000-0000-4000-8000-000000000001';
insert into public.product_sales (product_id, percent_off) values ('a6700000-0000-4000-8000-000000000003', 10);
insert into public.product_sales (product_id, percent_off, starts_at, ends_at)
values ('a6700000-0000-4000-8000-000000000002', 10, now() - interval '2 days', now() - interval '1 day');

-- a customer -----------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"67111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.product_sales where product_id::text like 'a67%'), 0,
  'a customer sees no planned, ended or draft product''s sale');
select is((select count(*)::int from public.collections where id::text like 'd67%'), 1, 'a customer reads published collections only');
select is_empty(
  $$update public.collections set is_published = false where id = 'd6700000-0000-4000-8000-000000000001' returning id$$,
  'a customer cannot unpublish a collection'
);
select is_empty(
  $$update public.collection_products set position = 9 where collection_id = 'd6700000-0000-4000-8000-000000000001' returning 1$$,
  'a customer cannot reorder a collection'
);
select throws_ok(
  $$insert into public.collection_sales (collection_id, percent_off, created_by)
    values ('d6700000-0000-4000-8000-000000000002', 50, '67111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'a customer cannot start a collection sale, even attributed to themselves'
);
select throws_ok(
  $$select public.admin_set_collection_products('d6700000-0000-4000-8000-000000000001', array[]::uuid[])$$,
  '42501', null, 'a customer cannot change a collection''s pieces'
);
reset role;

-- the admin ------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"67222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.product_sales where product_id::text like 'a67%'), 3, 'an admin sees every sale');
select throws_ok(
  $$select public.admin_save_collection(null, '{"is_published":true}', '[{"locale":"en","slug":"summer","name":"Summer"}]')$$,
  '23514', null, 'a published collection needs its uk translation'
);
select lives_ok(
  $$select public.admin_save_collection('d6700000-0000-4000-8000-000000000002', '{"is_published":true,"position":1}',
    '[{"locale":"uk","slug":"lito","name":"Літо","description":"Сонячні прикраси"},{"locale":"en","slug":"summer","name":"Summer"}]')$$,
  'an admin saves and publishes a collection with its translations'
);
select results_eq(
  $$select locale::text, slug, name, source::text from public.collection_translations
    where collection_id = 'd6700000-0000-4000-8000-000000000002' order by locale$$,
  $$values ('en', 'summer', 'Summer', 'human'), ('uk', 'lito', 'Літо', 'human')$$,
  'the translations are replaced (the old uk slug is gone)'
);
-- the API roles cannot read the audit columns (an admin's screens read them through the service role)
reset role;
select is((select updated_by from public.collections where id = 'd6700000-0000-4000-8000-000000000002'),
  '67222222-2222-4222-8222-222222222222'::uuid, 'the audit columns name the admin');
set local role authenticated;
select lives_ok(
  $$select public.admin_set_collection_products('d6700000-0000-4000-8000-000000000001',
    array['a6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000004']::uuid[])$$,
  'an admin sets a collection''s pieces'
);
select results_eq(
  $$select product_id, position from public.collection_products where collection_id = 'd6700000-0000-4000-8000-000000000001' order by position$$,
  $$values ('a6700000-0000-4000-8000-000000000001'::uuid, 0), ('a6700000-0000-4000-8000-000000000004'::uuid, 1)$$,
  'pieces added, removed and ordered in one list'
);
select throws_ok(
  $$select public.admin_set_collection_products('d6700000-0000-4000-8000-000000000001',
    array['a6700000-0000-4000-8000-000000000001', 'a6700000-0000-4000-8000-000000000001']::uuid[])$$,
  '22023', null, 'a piece listed twice is refused'
);
select lives_ok(
  $$insert into public.product_sales (product_id, percent_off) values ('a6700000-0000-4000-8000-000000000004', 20)$$,
  'an admin starts a sale'
);
select is(
  (select (public.admin_delete_collection('d6700000-0000-4000-8000-000000000002') ->> 'deleted')::boolean),
  true, 'an admin deletes a collection'
);
reset role;

-- An order line keeps the regular price next to the sale price -------------------------------------------------------
insert into public.orders (id, idempotency_key, locale, first_name, phone, email, country, delivery_carrier, delivery_method,
  delivery_destination, delivery_estimate_state, currency, currency_decimals, fx_rate, markup_bps, items_total_usd_minor, items_total_minor)
values ('e6700000-0000-4000-8000-000000000001', gen_random_uuid(), 'en', 'Test', '+380501234567', 'sale@example.test', 'DE',
  'nova_post', 'address', '{}', 'unavailable', 'USD', 2, 1, 300, 700, 700);
insert into public.order_items (order_id, position, product_id, fulfillment, title, title_locale, quantity, unit_price_usd_minor,
  unit_price_minor, line_total_usd_minor, line_total_minor)
values ('e6700000-0000-4000-8000-000000000001', 0, 'a6700000-0000-4000-8000-000000000002', 'made_to_order', 'Ring', 'en', 1, 700, 700, 700, 700);
select results_eq(
  $$select regular_unit_price_usd_minor, regular_unit_price_minor from public.order_items where order_id = 'e6700000-0000-4000-8000-000000000001'$$,
  $$values (700::bigint, 700::bigint)$$,
  'a line stored without its regular price gets the unit price'
);
select throws_ok(
  $$insert into public.order_items (order_id, position, product_id, fulfillment, title, title_locale, quantity,
      unit_price_usd_minor, unit_price_minor, line_total_usd_minor, line_total_minor, regular_unit_price_usd_minor, regular_unit_price_minor)
    values ('e6700000-0000-4000-8000-000000000001', 1, 'a6700000-0000-4000-8000-000000000004', 'made_to_order', 'Ring', 'en', 1,
      700, 700, 700, 700, 600, 700)$$,
  '23514', null, 'a regular price below the price charged is refused'
);

select * from finish();
rollback;
