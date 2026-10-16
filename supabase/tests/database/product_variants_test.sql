-- #66: product variants. The rules across tables (made to order only, a price above zero, an ordered variant is
-- never deleted), the public read and the admin-only writes, the cart lines and the order lines with variants,
-- and the listing price of a product with variants.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

insert into auth.users (id, email) values
  ('61111111-1111-4111-8111-111111111111', 'variants-customer-' || gen_random_uuid() || '@example.test'),
  ('62222222-2222-4222-8222-222222222222', 'variants-admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '62222222-2222-4222-8222-222222222222';

-- P1 published ring ($20), P2 a draft, P3 a one-of-a-kind piece, P4 a cheap published ring ($5), P5 another ring
insert into public.products (id, category_id, sku, status, fulfillment, price_usd)
select p.id::uuid, c.id, p.sku, p.status::public.product_status, p.fulfillment::public.product_fulfillment, p.price
from (values
  ('b6000000-0000-4000-8000-000000000001', 'PGTAP-66-1', 'published', 'made_to_order', 20.00),
  ('b6000000-0000-4000-8000-000000000002', 'PGTAP-66-2', 'draft', 'made_to_order', 10.00),
  ('b6000000-0000-4000-8000-000000000003', 'PGTAP-66-3', 'published', 'one_of_a_kind', 30.00),
  ('b6000000-0000-4000-8000-000000000004', 'PGTAP-66-4', 'published', 'made_to_order', 5.00),
  ('b6000000-0000-4000-8000-000000000005', 'PGTAP-66-5', 'published', 'made_to_order', 8.00)
) as p (id, sku, status, fulfillment, price)
join public.categories c on c.slug = 'rings';
insert into public.product_translations (product_id, locale, slug, title)
values
  ('b6000000-0000-4000-8000-000000000001', 'en', 'pgtap-66-ring', 'PGTAP 66 ring'),
  ('b6000000-0000-4000-8000-000000000005', 'en', 'pgtap-66-other-ring', 'PGTAP 66 other ring');

-- V1 size 16 (+$0), V2 size 18 (+$2.50) and V3 (deleted) of P1; V4 of the draft P2; V5 of P5
insert into public.product_variants (id, product_id, sku_suffix, price_delta_usd_minor, position) values
  ('c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '16', 0, 0),
  ('c6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000001', '18', 250, 1),
  ('c6000000-0000-4000-8000-000000000003', 'b6000000-0000-4000-8000-000000000001', '20', 0, 2),
  ('c6000000-0000-4000-8000-000000000004', 'b6000000-0000-4000-8000-000000000002', null, 0, 0),
  ('c6000000-0000-4000-8000-000000000005', 'b6000000-0000-4000-8000-000000000005', null, 0, 0);
update public.product_variants set deleted_at = now() where id = 'c6000000-0000-4000-8000-000000000003';
insert into public.product_variant_translations (variant_id, locale, label) values
  ('c6000000-0000-4000-8000-000000000001', 'uk', '16'),
  ('c6000000-0000-4000-8000-000000000001', 'en', '16'),
  ('c6000000-0000-4000-8000-000000000002', 'uk', '18'),
  ('c6000000-0000-4000-8000-000000000003', 'uk', '20'),
  ('c6000000-0000-4000-8000-000000000004', 'uk', 'S'),
  ('c6000000-0000-4000-8000-000000000005', 'uk', 'M');

select is((select relrowsecurity from pg_class where oid = 'public.product_variants'::regclass), true, 'RLS is enabled on product_variants');
select is((select relrowsecurity from pg_class where oid = 'public.product_variant_translations'::regclass), true, 'RLS is enabled on product_variant_translations');

-- The rules (as the table owner: they hold for every writer) ---------------------------------------------------

select throws_ok(
  $$insert into public.product_variants (product_id) values ('b6000000-0000-4000-8000-000000000003')$$,
  '23514', null, 'a one-of-a-kind product has no variants'
);
select throws_ok(
  $$insert into public.product_variants (product_id, price_delta_usd_minor) values ('b6000000-0000-4000-8000-000000000004', -500)$$,
  '23514', null, 'a variant price of zero is refused'
);
select lives_ok(
  $$insert into public.product_variants (id, product_id, price_delta_usd_minor)
    values ('c6000000-0000-4000-8000-000000000006', 'b6000000-0000-4000-8000-000000000004', -499)$$,
  'a negative difference is fine while the price stays above zero ($0.01)'
);
select throws_ok(
  $$update public.products set price_usd = 4.99 where id = 'b6000000-0000-4000-8000-000000000004'$$,
  '23514', null, 'the product price cannot drop a live variant to zero'
);
select throws_ok(
  $$update public.products set fulfillment = 'one_of_a_kind' where id = 'b6000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a product with variants cannot become one of a kind'
);
select lives_ok(
  $$update public.products set price_usd = 21.00 where id = 'b6000000-0000-4000-8000-000000000001'$$,
  'a price change that keeps every variant above zero is fine'
);
update public.products set price_usd = 20.00 where id = 'b6000000-0000-4000-8000-000000000001';
select throws_ok(
  $$update public.product_variants set product_id = 'b6000000-0000-4000-8000-000000000005'
    where id = 'c6000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a variant never moves to another product'
);
select throws_ok(
  $$insert into public.product_variants (product_id, sku_suffix) values ('b6000000-0000-4000-8000-000000000001', '16')$$,
  '23505', null, 'a SKU suffix is unique among the live variants of a product'
);
select lives_ok(
  $$insert into public.product_variants (id, product_id, sku_suffix)
    values ('c6000000-0000-4000-8000-000000000007', 'b6000000-0000-4000-8000-000000000001', '20')$$,
  'the suffix of a deleted variant can be used again'
);
delete from public.product_variants where id = 'c6000000-0000-4000-8000-000000000007';
select throws_ok(
  $$insert into public.product_variants (product_id, sku_suffix) values ('b6000000-0000-4000-8000-000000000001', 'a b')$$,
  '23514', null, 'a SKU suffix is letters and digits with dots or dashes'
);
select throws_ok(
  $$insert into public.product_variant_translations (variant_id, locale, label) values ('c6000000-0000-4000-8000-000000000002', 'en', '  ')$$,
  '23514', null, 'a label is not blank'
);

-- The listing price: the lowest of the live variants that can be ordered, else of the live ones, else the product's
select is(private.listing_price_usd('b6000000-0000-4000-8000-000000000001', 20.00), 20.00::numeric, 'the listing price is the lowest variant price');
select is(private.listing_price_usd('b6000000-0000-4000-8000-000000000004', 5.00), 0.01::numeric, 'a negative difference lowers the listing price');
select is(
  private.listing_price_usd((select id from public.products where sku = 'TEST-001'), 24.90), 24.90::numeric,
  'a product without variants lists at its own price'
);

-- Anon ----------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq(
  $$select id::text from public.product_variants where product_id = 'b6000000-0000-4000-8000-000000000001' order by position$$,
  $$values ('c6000000-0000-4000-8000-000000000001'), ('c6000000-0000-4000-8000-000000000002')$$,
  'the public reads the live variants of a published product, not the deleted one'
);
select is(
  (select count(*)::int from public.product_variants where product_id = 'b6000000-0000-4000-8000-000000000002'),
  0, 'the public reads no variant of a draft'
);
select is(
  (select count(*)::int from public.product_variant_translations where variant_id in
    ('c6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000004')),
  0, 'the public reads no label of a deleted variant or of a draft''s variant'
);
select is(
  (select count(*)::int from public.product_variant_translations where variant_id = 'c6000000-0000-4000-8000-000000000001'),
  2, 'the public reads the labels of a live variant'
);
select throws_ok($$select deleted_at from public.product_variants$$, '42501', null, 'the public cannot read the soft-delete mark');
select throws_ok($$select created_by from public.product_variants$$, '42501', null, 'the public cannot read who wrote a variant');
select throws_ok(
  $$insert into public.product_variants (product_id) values ('b6000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon cannot insert a variant'
);
select throws_ok(
  $$select public.admin_save_product_variant('b6000000-0000-4000-8000-000000000001', null, '{}', '[{"locale":"uk","label":"x"}]')$$,
  '42501', null, 'anon cannot call admin_save_product_variant'
);
reset role;

-- Customer ------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"61111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.product_variants (product_id) values ('b6000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a customer cannot insert a variant'
);
select throws_ok(
  $$update public.product_variants set price_delta_usd_minor = 1 where id = 'c6000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'a customer cannot change a variant'
);
select throws_ok(
  $$insert into public.product_variant_translations (variant_id, locale, label) values ('c6000000-0000-4000-8000-000000000002', 'en', 'x')$$,
  '42501', null, 'a customer cannot add a label'
);
select throws_ok(
  $$select public.admin_save_product_variant('b6000000-0000-4000-8000-000000000001', null, '{}', '[{"locale":"uk","label":"x"}]')$$,
  '42501', null, 'a customer cannot save a variant'
);
select throws_ok(
  $$select public.admin_set_product_variant_available('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', false)$$,
  '42501', null, 'a customer cannot disable a variant'
);
select throws_ok(
  $$select public.admin_reorder_product_variants('b6000000-0000-4000-8000-000000000001', '{}')$$,
  '42501', null, 'a customer cannot reorder variants'
);
select throws_ok(
  $$select public.admin_delete_product_variant('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a customer cannot delete a variant'
);

-- the cart: two sizes of one product are two lines; a line names only a live variant of its own product
select lives_ok(
  $$insert into public.cart_items (product_id, variant_id, quantity) values
    ('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 1),
    ('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 10)$$,
  'a customer puts two sizes of one product into the cart'
);
select throws_ok(
  $$insert into public.cart_items (product_id, variant_id, quantity)
    values ('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000005', 1)$$,
  '42501', null, 'a cart line cannot name a variant of another product'
);
select throws_ok(
  $$insert into public.cart_items (product_id, variant_id, quantity)
    values ('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000003', 1)$$,
  '42501', null, 'a cart line cannot name a deleted variant'
);
select throws_ok(
  $$update public.cart_items set variant_id = 'c6000000-0000-4000-8000-000000000005'
    where variant_id = 'c6000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'a cart line cannot be switched to a variant of another product'
);
reset role;

-- Admin ---------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.product_variants (product_id) values ('b6000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'an admin writes variants only through the admin functions'
);
select lives_ok(
  $$select public.admin_save_product_variant(
      'b6000000-0000-4000-8000-000000000001', null,
      '{"sku_suffix": "17", "price_delta_usd_minor": 100, "is_available": true}',
      '[{"locale": "uk", "label": "17"}, {"locale": "en", "label": "17 (EU)"}]')$$,
  'an admin adds a variant'
);
reset role;
select results_eq(
  $$select position, price_delta_usd_minor, is_available, created_by::text from public.product_variants where sku_suffix = '17'$$,
  $$values (2, 100, true, '62222222-2222-4222-8222-222222222222')$$,
  'a new variant goes last (after the live ones), attributed to the admin'
);
select set_config('request.jwt.claims', '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.admin_save_product_variant(
      'b6000000-0000-4000-8000-000000000001', (select id from public.product_variants where sku_suffix = '17'),
      '{"sku_suffix": "17", "price_delta_usd_minor": -150, "is_available": true}',
      '[{"locale": "uk", "label": "17,0"}]')$$,
  'an admin renames a variant and changes its price difference'
);
select results_eq(
  $$select locale::text, label from public.product_variant_translations
    where variant_id = (select id from public.product_variants where sku_suffix = '17')$$,
  $$values ('uk', '17,0')$$,
  'the saved labels replace the stored ones'
);
select throws_ok(
  $$select public.admin_save_product_variant('b6000000-0000-4000-8000-000000000003', null, '{}', '[{"locale":"uk","label":"x"}]')$$,
  '23514', null, 'an admin cannot give a one-of-a-kind piece a variant'
);
select throws_ok(
  $$select public.admin_save_product_variant('b6000000-0000-4000-8000-000000000001', null, '{}', '[]')$$,
  '22023', null, 'a variant needs a label'
);
select throws_ok(
  $$select public.admin_save_product_variant('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000003', '{}',
      '[{"locale":"uk","label":"x"}]')$$,
  'P0002', null, 'a deleted variant cannot be saved'
);
select throws_ok(
  $$select public.admin_save_product_variant('b6000000-0000-4000-8000-000000000001', null, '{"sku_suffix": "18"}',
      '[{"locale":"uk","label":"x"}]')$$,
  '23505', null, 'a taken SKU suffix is refused'
);
select is(
  public.admin_set_product_variant_available('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', false),
  true, 'an admin disables a variant'
);
select throws_ok(
  $$select public.admin_reorder_product_variants('b6000000-0000-4000-8000-000000000001',
      array['c6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002']::uuid[])$$,
  '40001', null, 'a reorder that misses a live variant is refused'
);
select lives_ok(
  $$select public.admin_reorder_product_variants('b6000000-0000-4000-8000-000000000001',
      array[(select id from public.product_variants where sku_suffix = '17'),
            'c6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001']::uuid[])$$,
  'an admin reorders the variants'
);
reset role;
select results_eq(
  $$select coalesce(sku_suffix, '-'), position, is_available from public.product_variants
    where product_id = 'b6000000-0000-4000-8000-000000000001' and deleted_at is null order by position$$,
  $$values ('17', 0, true), ('18', 1, true), ('16', 2, false)$$,
  'the variants are stored in the new order, size 16 disabled'
);
select is(
  private.listing_price_usd('b6000000-0000-4000-8000-000000000001', 20.00), 18.50::numeric,
  'the listing price follows the variants that can be ordered'
);

-- Orders (the function owner stands in for the server's service role) ---------------------------------------------

create function pg_temp.order_json(p_key uuid, p_usd bigint) returns jsonb
language sql as $$
  select jsonb_build_object(
    'idempotency_key', p_key, 'user_id', null, 'locale', 'uk',
    'first_name', 'Olena', 'last_name', null, 'phone', '+380501234567', 'email', 'olena@example.test',
    'comment', null, 'country', 'UA', 'delivery_carrier', 'nova_poshta', 'delivery_method', 'warehouse',
    'delivery_destination', jsonb_build_object('warehouse', 'x'),
    'delivery_estimate_state', 'tbd', 'delivery_estimate_source', 'flat_rate',
    'delivery_estimate_minor', null, 'delivery_estimate_currency', null, 'delivery_estimate_decimals', null,
    'currency', 'USD', 'currency_decimals', 2, 'fx_rate', '1', 'fx_rate_date', null, 'markup_bps', 300,
    'items_total_usd_minor', p_usd, 'items_total_minor', p_usd
  );
$$;

create function pg_temp.line(p_variant uuid, p_position integer, p_usd bigint, p_product uuid default 'b6000000-0000-4000-8000-000000000001')
returns jsonb
language sql as $$
  select jsonb_build_object(
    'product_id', p_product, 'variant_id', p_variant, 'position', p_position, 'title', 'Каблучка',
    'title_locale', 'uk', 'variant_label', case when p_variant is not null then 'Розмір ' || p_position end,
    'variant_label_locale', case when p_variant is not null then 'uk' end,
    'quantity', 1, 'unit_price_usd_minor', p_usd, 'unit_price_minor', p_usd
  );
$$;

select is(
  public.create_order_request(
    pg_temp.order_json('d6000000-0000-4000-8000-000000000001', 3700),
    jsonb_build_array(
      pg_temp.line((select id from public.product_variants where sku_suffix = '17'), 0, 1850),
      pg_temp.line('c6000000-0000-4000-8000-000000000002', 1, 1850))
  ) - 'order_id' - 'number',
  jsonb_build_object('ok', true, 'replayed', false, 'user_id', null),
  'an order request with two sizes of one product is placed'
);
select results_eq(
  $$select i.position::int, i.sku, i.variant_label, i.variant_label_locale::text, i.unit_price_usd_minor::int
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.idempotency_key = 'd6000000-0000-4000-8000-000000000001' order by i.position$$,
  $$values (0, 'PGTAP-66-1-17', 'Розмір 0', 'uk', 1850), (1, 'PGTAP-66-1-18', 'Розмір 1', 'uk', 1850)$$,
  'the order lines keep the variant label, its locale, the SKU with the suffix and the price'
);
select is(
  public.create_order_request(
    pg_temp.order_json('d6000000-0000-4000-8000-000000000002', 2000),
    jsonb_build_array(pg_temp.line(null, 0, 2000))
  ),
  jsonb_build_object('ok', false, 'reason', 'unavailable', 'product_ids', jsonb_build_array('b6000000-0000-4000-8000-000000000001')),
  'a product with variants cannot be ordered without one'
);
select is(
  public.create_order_request(
    pg_temp.order_json('d6000000-0000-4000-8000-000000000003', 2000),
    jsonb_build_array(pg_temp.line('c6000000-0000-4000-8000-000000000001', 0, 2000))
  ) ->> 'reason',
  'unavailable',
  'a disabled variant cannot be ordered'
);
select is(
  public.create_order_request(
    pg_temp.order_json('d6000000-0000-4000-8000-000000000004', 2000),
    jsonb_build_array(pg_temp.line('c6000000-0000-4000-8000-000000000003', 0, 2000))
  ) ->> 'reason',
  'unavailable',
  'a deleted variant cannot be ordered'
);
select is(
  public.create_order_request(
    pg_temp.order_json('d6000000-0000-4000-8000-000000000005', 800),
    jsonb_build_array(pg_temp.line('c6000000-0000-4000-8000-000000000002', 0, 800, 'b6000000-0000-4000-8000-000000000005'))
  ) ->> 'reason',
  'unavailable',
  'a variant of another product cannot be ordered'
);
select is(
  (select count(*)::int from public.orders where idempotency_key in (
    'd6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000003',
    'd6000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000005')),
  0, 'a refused request stores nothing'
);
select throws_ok(
  $$update public.order_items set variant_label_locale = null where variant_label = 'Розмір 0'$$,
  '23514', null, 'an order line keeps a label only with its locale'
);

-- Deleting: only a variant nobody ordered ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_delete_product_variant('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002')$$,
  '23503', null, 'an ordered variant cannot be deleted'
);
select is(
  public.admin_delete_product_variant('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001'),
  true, 'an admin deletes a variant nobody ordered'
);
select is(
  public.admin_delete_product_variant('b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001'),
  false, 'a deleted variant is not deleted twice'
);
reset role;
select ok(
  (select deleted_at is not null from public.product_variants where id = 'c6000000-0000-4000-8000-000000000001'),
  'the delete is soft: the row stays'
);
select is(
  (select count(*)::int from public.cart_items where variant_id = 'c6000000-0000-4000-8000-000000000001'),
  1, 'a cart line of a deleted variant stays (the cart shows it as no longer available)'
);

-- The listing filters by the listing price ----------------------------------------------------------------------------
select is(
  (select 'b6000000-0000-4000-8000-000000000001'::uuid = any (ids)
   from public.shop_search('en', 'rings', p_price_min_minor => 1850, p_price_max_minor => 1850)),
  true, 'the price filter finds a product with variants by its lowest variant price'
);

select * from finish();
rollback;
