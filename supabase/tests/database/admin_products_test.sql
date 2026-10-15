-- Admin product management (#17): the lead time range and note, dimensions and clasp with their rules and
-- grants; the admin functions save, publish and soft-delete as admins only (customers and anon are refused and
-- change nothing), keep a product and its translations in one transaction and attribute the writes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- Fixtures (as the database owner) -------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111117', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222227', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222227';

insert into public.categories (id, slug) values ('c1700000-0000-4000-8000-000000000001', 'admin-test-category');
insert into public.products
  (id, category_id, status, fulfillment, lead_time_min_days, lead_time_max_days, price_usd, length_mm, width_mm, height_mm)
values
  ('b1700000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001', 'published', 'made_to_order', 3, 5, 10, 30, 12, 4),
  ('b1700000-0000-4000-8000-000000000002', 'c1700000-0000-4000-8000-000000000001', 'draft', 'made_to_order', 7, 9, 20, null, null, null),
  ('b1700000-0000-4000-8000-000000000003', 'c1700000-0000-4000-8000-000000000001', 'draft', 'one_of_a_kind', null, null, 30, null, null, null);
insert into public.product_translations (product_id, locale, slug, title, clasp, lead_time_note) values
  ('b1700000-0000-4000-8000-000000000001', 'en', 'admin-test-published', 'Published', 'Lobster clasp', 'Longer in December'),
  ('b1700000-0000-4000-8000-000000000002', 'en', 'admin-test-draft', 'Draft', 'Secret clasp', 'Secret note'),
  ('b1700000-0000-4000-8000-000000000003', 'en', 'admin-test-no-uk', 'No uk', null, null);

create temp table calls (who text, stmt text) on commit drop;
insert into calls values
  ('save new', $$select public.admin_save_product(null, '{"category_id":"c1700000-0000-4000-8000-000000000001","status":"draft","fulfillment":"made_to_order","availability":"available","price_usd":1,"weight_g":0}', '[]')$$),
  ('save existing', $$select public.admin_save_product('b1700000-0000-4000-8000-000000000001', '{"category_id":"c1700000-0000-4000-8000-000000000001","status":"draft","fulfillment":"made_to_order","availability":"available","price_usd":0,"weight_g":0}', '[]')$$),
  ('set status', $$select public.admin_set_product_status('b1700000-0000-4000-8000-000000000002', 'archived')$$),
  ('delete', $$select public.admin_delete_product('b1700000-0000-4000-8000-000000000001')$$);
create temp table direct_writes (stmt text) on commit drop;
insert into direct_writes values
  ($$update public.products set lead_time_min_days = 1, lead_time_max_days = 2, length_mm = 1 where id = 'b1700000-0000-4000-8000-000000000001'$$),
  ($$update public.product_translations set clasp = 'Hacked', lead_time_note = 'Hacked' where product_id = 'b1700000-0000-4000-8000-000000000001'$$);
grant select on calls, direct_writes to anon, authenticated;

create function pg_temp.fixture_state() returns text language sql as $$
  select concat_ws('|',
    (select string_agg(concat(id, status, price_usd, lead_time_min_days, lead_time_max_days, length_mm, deleted_at), ',' order by id)
       from public.products where category_id = 'c1700000-0000-4000-8000-000000000001'),
    (select string_agg(concat(product_id, locale, slug, clasp, lead_time_note), ',' order by product_id, locale)
       from public.product_translations where product_id::text like 'b1700000-%')
  );
$$;
grant execute on function pg_temp.fixture_state() to anon, authenticated;
create temp table baseline on commit drop as select pg_temp.fixture_state() as state;

-- Schema ---------------------------------------------------------------------------------------------
select has_column('public', 'products', 'lead_time_min_days', 'products have a lower lead time bound');
select has_column('public', 'products', 'lead_time_max_days', 'products have an upper lead time bound');
select hasnt_column('public', 'products', 'lead_time_days', 'the single lead time is gone (renamed)');
select has_column('public', 'products', 'length_mm', 'products have a length');
select has_column('public', 'products', 'width_mm', 'products have a width');
select has_column('public', 'products', 'height_mm', 'products have a height');
select has_column('public', 'product_translations', 'clasp', 'translations have a clasp');
select has_column('public', 'product_translations', 'lead_time_note', 'translations have a lead time note');

-- Rules (as the owner) ---------------------------------------------------------------------------------
select throws_ok(
  $$update public.products set lead_time_max_days = null where id = 'b1700000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a lead time has both bounds or none'
);
select throws_ok(
  $$update public.products set lead_time_min_days = 6 where id = 'b1700000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the lower bound is not above the upper one'
);
select throws_ok(
  $$update public.products set lead_time_min_days = 1, lead_time_max_days = 2 where id = 'b1700000-0000-4000-8000-000000000003'$$,
  '23514', null, 'a one-of-a-kind piece has no lead time range'
);
select lives_ok(
  $$update public.products set lead_time_min_days = 4, lead_time_max_days = 4 where id = 'b1700000-0000-4000-8000-000000000002'$$,
  'a fixed lead time is a range of one value'
);
select throws_ok(
  $$update public.products set length_mm = 0 where id = 'b1700000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a dimension is positive'
);
select throws_ok(
  $$update public.product_translations set clasp = ' ' where product_id = 'b1700000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a clasp is not blank (null when there is none)'
);
select throws_ok(
  $$update public.product_translations set lead_time_note = '' where product_id = 'b1700000-0000-4000-8000-000000000001'$$,
  '23514', null, 'a lead time note is not blank'
);
update public.products set lead_time_min_days = 7, lead_time_max_days = 9 where id = 'b1700000-0000-4000-8000-000000000002';

-- Anon ---------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select results_eq(
  $$select lead_time_min_days, lead_time_max_days, length_mm, width_mm, height_mm from public.products where category_id = 'c1700000-0000-4000-8000-000000000001'$$,
  $$values (3, 5, 30.0::numeric, 12.0::numeric, 4.0::numeric)$$,
  'anon reads the new fields of the published product only'
);
select results_eq(
  $$select clasp, lead_time_note from public.product_translations where product_id::text like 'b1700000-%'$$,
  $$values ('Lobster clasp', 'Longer in December')$$,
  'anon reads the clasp and note of the published product, not of a draft'
);
select throws_ok(stmt, '42501', null, 'anon cannot call admin ' || who) from calls order by who;
reset role;
select is(pg_temp.fixture_state(), (select state from baseline), 'anon changed nothing');

-- Customer -----------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111117","role":"authenticated"}', true);
set local role authenticated;
select is_empty(
  $$select 1 from public.product_translations where product_id = 'b1700000-0000-4000-8000-000000000002'$$,
  'a customer cannot read a draft'
);
select throws_ok(stmt, '42501', null, 'a customer cannot call admin ' || who) from calls order by who;
select lives_ok(stmt, 'a customer''s direct write runs but RLS matches no row') from direct_writes;
reset role;
select is(pg_temp.fixture_state(), (select state from baseline), 'customer writes changed nothing');

-- Admin --------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222227","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.admin_save_product(null,
    '{"category_id":"c1700000-0000-4000-8000-000000000001","status":"published","fulfillment":"made_to_order","availability":"available","price_usd":5,"weight_g":0}',
    '[{"locale":"en","slug":"admin-test-new-en","title":"New"}]')$$,
  '23514', null, 'publishing without the uk translation is refused'
);
create temp table saved on commit drop as
select public.admin_save_product(null,
  '{"category_id":"c1700000-0000-4000-8000-000000000001","sku":"ADMIN-17-NEW","status":"published","fulfillment":"made_to_order","availability":"available","lead_time_min_days":3,"lead_time_max_days":8,"price_usd":"29.90","weight_g":"5.5","length_mm":"41.5","width_mm":null,"height_mm":null,"position":2}',
  '[{"locale":"uk","slug":"admin-test-new-uk","title":"Новий","clasp":"Карабін","lead_time_note":"Довше в грудні"},
    {"locale":"en","slug":"admin-test-new-en","title":"New","description":"Text","source":"machine"}]') as id;
grant select on saved to authenticated;
select isnt((select id from saved), null, 'an admin creates a published product with its translations');
select results_eq(
  $$select status::text, price_usd, lead_time_min_days, lead_time_max_days, length_mm, position from public.products where id = (select id from saved)$$,
  $$values ('published', 29.90::numeric, 3, 8, 41.5::numeric, 2)$$,
  'the product fields are saved'
);
select results_eq(
  $$select locale::text, slug, clasp, lead_time_note, source::text from public.product_translations where product_id = (select id from saved) order by locale$$,
  $$values ('en', 'admin-test-new-en', null, null, 'machine'), ('uk', 'admin-test-new-uk', 'Карабін', 'Довше в грудні', 'human')$$,
  'the translations are saved, human unless stated'
);

-- A slug taken by another product rolls the whole save back (the price change too).
select throws_ok(
  $$select public.admin_save_product((select id from saved),
    '{"category_id":"c1700000-0000-4000-8000-000000000001","status":"published","fulfillment":"made_to_order","availability":"available","price_usd":99,"weight_g":0}',
    '[{"locale":"uk","slug":"admin-test-new-uk","title":"Новий"},{"locale":"en","slug":"admin-test-published","title":"Taken"}]')$$,
  '23505', null, 'a slug of another product is refused'
);
select is((select price_usd from public.products where id = (select id from saved)), 29.90::numeric, 'a refused save changes nothing');

-- An edit replaces the translations: a locale left out is removed.
select is(
  public.admin_save_product((select id from saved),
    '{"category_id":"c1700000-0000-4000-8000-000000000001","sku":"ADMIN-17-NEW","status":"published","fulfillment":"made_to_order","availability":"available","price_usd":31,"weight_g":0}',
    '[{"locale":"uk","slug":"admin-test-new-uk","title":"Новий 2"}]'),
  (select id from saved),
  'an admin edits a product'
);
select results_eq(
  $$select price_usd, lead_time_min_days from public.products where id = (select id from saved)$$,
  $$values (31::numeric, null::integer)$$,
  'the edit replaced the fields (a cleared lead time is null)'
);
select is(
  (select array_agg(locale::text) from public.product_translations where product_id = (select id from saved)),
  array['uk'],
  'the edit removed the locale it left out'
);
select throws_ok(
  $$select public.admin_save_product('b1700000-0000-4000-8000-0000000000ff',
    '{"category_id":"c1700000-0000-4000-8000-000000000001","status":"draft","fulfillment":"made_to_order","availability":"available","price_usd":1,"weight_g":0}', '[]')$$,
  'P0002', null, 'saving an unknown product is refused'
);

-- Status: one tap, uk required to publish.
select throws_ok(
  $$select public.admin_set_product_status('b1700000-0000-4000-8000-000000000003', 'published')$$,
  '23514', null, 'publishing a product without uk is refused'
);
select ok(public.admin_set_product_status((select id from saved), 'draft'), 'an admin unpublishes a product');
select ok(public.admin_set_product_status((select id from saved), 'published'), 'an admin publishes a product with uk');
select ok(not public.admin_set_product_status('b1700000-0000-4000-8000-0000000000ff', 'draft'), 'an unknown product is reported');
select ok(public.admin_delete_product((select id from saved)), 'an admin soft-deletes a product');
reset role;

select results_eq(
  $$select created_by, updated_by, deleted_at is not null from public.products where id = (select id from saved)$$,
  $$values ('22222222-2222-4222-8222-222222222227'::uuid, '22222222-2222-4222-8222-222222222227'::uuid, true)$$,
  'the writes name the admin, the delete is soft'
);
select results_eq(
  $$select created_by, updated_by from public.product_translations where product_id = (select id from saved)$$,
  $$values ('22222222-2222-4222-8222-222222222227'::uuid, '22222222-2222-4222-8222-222222222227'::uuid)$$,
  'the translations name the admin'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is_empty($$select 1 from public.products where sku = 'ADMIN-17-NEW'$$, 'anon no longer sees the deleted product');
reset role;

-- Service role (an import script) ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select isnt(
  public.admin_save_product(null,
    '{"category_id":"c1700000-0000-4000-8000-000000000001","status":"draft","fulfillment":"one_of_a_kind","availability":"sold","price_usd":3,"weight_g":0}',
    '[{"locale":"en","slug":"admin-test-imported","title":"Imported"}]'),
  null,
  'the service role may save through the function'
);
reset role;

select * from finish();
rollback;
