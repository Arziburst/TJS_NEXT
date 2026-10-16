-- Search and filters (#25): materials and colours are read by everyone and written only by admins (RLS, grants,
-- the admin functions); a product's terms follow its visibility; the storefront search and its filters return
-- only published products, match the visitor's locale with the en fallback, prefixes and typos, and count the
-- products per filter option. Seed (supabase/seed.sql): TEST-001..010 and 012 published, TEST-011 a draft,
-- TEST-013 archived, TEST-014 soft-deleted; seven terms and their links.
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

-- Fixtures (as the database owner) -------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111125', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222225', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222225';

-- product ids by SKU, read as the owner (anon cannot see the hidden ones)
create temp table fixture_ids on commit drop as select sku, id from public.products where sku like 'TEST-%';
grant select on fixture_ids to anon, authenticated;
create function pg_temp.ids(p_skus text[]) returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}') from fixture_ids where sku = any (p_skus);
$$;
create function pg_temp.sorted(p_ids uuid[]) returns uuid[] language sql as $$
  select coalesce(array_agg(id order by id), '{}') from unnest(p_ids) id;
$$;
create function pg_temp.skus(p_ids uuid[]) returns text language sql as $$
  select string_agg(f.sku, ',' order by o.n) from unnest(p_ids) with ordinality o (id, n) join fixture_ids f on f.id = o.id;
$$;
grant execute on function pg_temp.ids(text[]), pg_temp.sorted(uuid[]), pg_temp.skus(uuid[]) to anon, authenticated;

-- RLS and grants -------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.taxonomy_terms'::regclass), 'RLS is enabled on taxonomy_terms');
select ok((select relrowsecurity from pg_class where oid = 'public.taxonomy_term_translations'::regclass), 'RLS is enabled on taxonomy_term_translations');
select ok((select relrowsecurity from pg_class where oid = 'public.product_taxonomy_terms'::regclass), 'RLS is enabled on product_taxonomy_terms');
select ok(not has_function_privilege('anon', 'public.admin_save_taxonomy_term(uuid, public.taxonomy_kind, text, jsonb)', 'execute'), 'anon cannot execute admin_save_taxonomy_term');
select ok(not has_function_privilege('anon', 'public.admin_delete_taxonomy_term(uuid)', 'execute'), 'anon cannot execute admin_delete_taxonomy_term');
-- security definer: only an admin's JWT gets in, so the service role (no JWT) has no grant either
select ok(not has_function_privilege('service_role', 'public.admin_delete_taxonomy_term(uuid)', 'execute'), 'the service role cannot execute admin_delete_taxonomy_term');
select is(
  (select prosecdef from pg_proc where oid = 'public.admin_delete_taxonomy_term(uuid)'::regprocedure),
  true,
  'admin_delete_taxonomy_term is security definer (it reads products.deleted_at)'
);
select ok(not has_function_privilege('anon', 'public.admin_save_product_with_terms(uuid, jsonb, jsonb, uuid[])', 'execute'), 'anon cannot execute admin_save_product_with_terms');
select ok(has_function_privilege('anon', 'public.shop_search(public.locale, text, text[], text[], text[], bigint, bigint, text[], text, integer, integer)', 'execute'), 'anon may search');

-- anon
set local role anon;
select is((select count(*)::int from public.taxonomy_terms), 7, 'anon reads every term');
select is((select count(*)::int from public.taxonomy_term_translations), 15, 'anon reads every term name');
select throws_ok($$select created_by from public.taxonomy_terms$$, '42501', null, 'anon cannot read who created a term');
select is(
  (select count(*)::int from public.product_taxonomy_terms where product_id = any (pg_temp.ids(array['TEST-011', 'TEST-014']))),
  0,
  'the terms of a draft and of a deleted product are hidden with their product'
);
select is((select count(*)::int from public.product_taxonomy_terms), 20, 'anon reads the terms of visible products');
select throws_ok($$insert into public.taxonomy_terms (kind, slug) values ('material', 'anon-term')$$, '42501', null, 'anon cannot add a term');
select throws_ok($$select private.shop_candidates('en', null, null, null, null, null, null, null)$$, '42501', null, 'anon cannot call the private search helper');
reset role;

-- customer
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111125","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.taxonomy_terms (kind, slug, created_by) values ('material', 'customer-term', '11111111-1111-4111-8111-111111111125')$$,
  '42501', null, 'a customer cannot add a term'
);
update public.taxonomy_term_translations set name = 'Hacked' where term_id = 'd2500000-0000-4000-8000-000000000001';
delete from public.product_taxonomy_terms where term_id = 'd2500000-0000-4000-8000-000000000001';
delete from public.taxonomy_terms where id = 'd2500000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.admin_save_taxonomy_term(null, 'material', 'customer-term', '{"uk":"Клієнт"}')$$,
  '42501', null, 'a customer cannot save a term through the admin function'
);
select throws_ok($$select public.admin_delete_taxonomy_term('d2500000-0000-4000-8000-000000000004')$$, '42501', null, 'a customer cannot delete a term');
select throws_ok(
  $$select public.admin_save_product_with_terms((select id from public.products where sku = 'TEST-012'),
    '{"category_id":"00000000-0000-0000-0000-000000000000","status":"published","fulfillment":"made_to_order","availability":"available","price_usd":1,"weight_g":0}',
    '[]', '{}')$$,
  '42501', null, 'a customer cannot save a product''s terms'
);
reset role;
select is(
  (select name from public.taxonomy_term_translations where term_id = 'd2500000-0000-4000-8000-000000000001' and locale = 'en'),
  'Brass', 'a customer''s rename changed nothing'
);
select is(
  (select count(*)::int from public.product_taxonomy_terms where term_id = 'd2500000-0000-4000-8000-000000000001'),
  4, 'a customer''s removal of links changed nothing'
);
select ok(exists (select 1 from public.taxonomy_terms where id = 'd2500000-0000-4000-8000-000000000004'), 'a customer''s delete changed nothing');

-- admin
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222225","role":"authenticated"}', true);
set local role authenticated;
select set_config('pgtap.term', public.admin_save_taxonomy_term(null, 'material', 'pgtap-silver',
  '{"uk":"Срібло тест","en":"Silver test","de":" "}')::text, true);
reset role;
select is((select kind::text || ':' || slug from public.taxonomy_terms where id = current_setting('pgtap.term')::uuid), 'material:pgtap-silver', 'an admin adds a term');
select is((select created_by from public.taxonomy_terms where id = current_setting('pgtap.term')::uuid), '22222222-2222-4222-8222-222222222225'::uuid, 'the term is attributed to the admin');
select set_eq(
  $$select locale::text || '=' || name from public.taxonomy_term_translations where term_id = current_setting('pgtap.term')::uuid$$,
  array['uk=Срібло тест', 'en=Silver test'],
  'blank names are left out'
);
set local role authenticated;
select lives_ok(
  $$select public.admin_save_taxonomy_term(current_setting('pgtap.term')::uuid, 'colour', 'ignored', '{"uk":"Срібло","pl":"Srebro"}')$$,
  'an admin renames a term'
);
reset role;
select set_eq(
  $$select locale::text || '=' || name from public.taxonomy_term_translations where term_id = current_setting('pgtap.term')::uuid$$,
  array['uk=Срібло', 'pl=Srebro'],
  'a rename replaces the names: the locales left out lose theirs'
);
select is((select kind::text || ':' || slug from public.taxonomy_terms where id = current_setting('pgtap.term')::uuid), 'material:pgtap-silver', 'a rename keeps the kind and the slug');
set local role authenticated;
select throws_ok($$select public.admin_save_taxonomy_term(null, 'material', 'no-uk', '{"en":"No uk"}')$$, '23514', null, 'a term needs its uk name');
select throws_ok($$select public.admin_save_taxonomy_term(null, 'material', 'brass-2', '{"uk":"латунь"}')$$, '23505', null, 'a list has a name once (case does not matter)');
select lives_ok($$select public.admin_save_taxonomy_term(null, 'colour', 'brass-colour', '{"uk":"Латунь"}')$$, 'the same name may be in the other list');
select throws_ok($$select public.admin_save_taxonomy_term(null, 'material', 'brass', '{"uk":"Інша латунь"}')$$, '23505', null, 'a slug is unique in its list');
select is(public.admin_delete_taxonomy_term('d2500000-0000-4000-8000-000000000001'), 'in_use', 'a term in use is not deleted');
select is(public.admin_delete_taxonomy_term(current_setting('pgtap.term')::uuid), 'deleted', 'an unused term is deleted');
select is(public.admin_delete_taxonomy_term(current_setting('pgtap.term')::uuid), 'not_found', 'a deleted term is not found');
select lives_ok(
  $$insert into public.product_taxonomy_terms (product_id, term_id)
    select id, (select public.admin_save_taxonomy_term(null, 'material', 'only-deleted', '{"uk":"Лише видалений"}'))
    from public.products where sku = 'TEST-014'$$,
  'an admin links a term to a soft-deleted product'
);
select is(
  public.admin_delete_taxonomy_term((select id from public.taxonomy_terms where slug = 'only-deleted')),
  'deleted',
  'a term only a soft-deleted product has is deleted, its link with it'
);
reset role;

-- a product's terms are saved with the product, in one transaction
create temp table product_payload on commit drop as
  select p.id, jsonb_build_object('category_id', p.category_id, 'sku', p.sku, 'status', 'published', 'fulfillment', 'made_to_order',
    'availability', 'available', 'price_usd', 19.90, 'weight_g', 7) as product,
    (select jsonb_agg(jsonb_build_object('locale', t.locale, 'slug', t.slug, 'title', t.title))
     from public.product_translations t where t.product_id = p.id) as translations
  from public.products p where p.sku = 'TEST-012';
grant select on product_payload to authenticated;
set local role authenticated;
select lives_ok(
  $$select public.admin_save_product_with_terms(id, product, translations,
    array['d2500000-0000-4000-8000-000000000004', 'd2500000-0000-4000-8000-000000000011']::uuid[]) from product_payload$$,
  'an admin saves a product with its terms'
);
select set_eq(
  $$select term_id from public.product_taxonomy_terms where product_id = (select id from product_payload)$$,
  array['d2500000-0000-4000-8000-000000000004', 'd2500000-0000-4000-8000-000000000011']::uuid[],
  'the product has exactly the chosen terms'
);
select lives_ok(
  $$select public.admin_save_product_with_terms(id, product, translations, array['d2500000-0000-4000-8000-000000000011']::uuid[]) from product_payload$$,
  'an admin unticks a term'
);
select set_eq(
  $$select term_id from public.product_taxonomy_terms where product_id = (select id from product_payload)$$,
  array['d2500000-0000-4000-8000-000000000011']::uuid[],
  'the unticked term is gone from the product'
);
select throws_ok(
  $$select public.admin_save_product_with_terms(id, product || '{"price_usd": 99}', translations,
    array['00000000-0000-4000-8000-000000000000']::uuid[]) from product_payload$$,
  '23503', null, 'an unknown term is refused'
);
reset role;
select is((select price_usd from public.products where id = (select id from product_payload)), 19.90, 'a refused save of the terms rolls back the product');
-- back to the seed state for the search tests below
delete from public.product_taxonomy_terms where product_id = (select id from product_payload);

-- Search and filters as anon --------------------------------------------------------------------------
set local role anon;
select is(
  (select pg_temp.sorted(ids) from public.shop_search('en', p_terms => array['glass'])),
  pg_temp.ids(array['TEST-002', 'TEST-006']),
  'search finds published products only (not the draft TEST-011 with its glass stone)'
);
select is(
  (select pg_temp.sorted(ids) from public.shop_search('uk', p_terms => array['корал'])),
  pg_temp.ids(array['TEST-001', 'TEST-008', 'TEST-009']),
  'uk: a word prefix matches («корал» finds «коралом», «коралу», «коралових»)'
);
select is(
  (select pg_temp.sorted(ids) from public.shop_search('de', p_terms => array['coral'])),
  pg_temp.ids(array['TEST-001', 'TEST-008', 'TEST-009']),
  'de: products are found through their en translation (the fallback) too'
);
select is(
  (select pg_temp.sorted(ids) from public.shop_search('en', p_terms => array['earr'])),
  pg_temp.ids(array['TEST-001', 'TEST-002', 'TEST-003']),
  'en: "earr" finds the earrings'
);
select ok(
  (select pg_temp.ids(array['TEST-001']) <@ ids from public.shop_search('en', p_terms => array['corol'], p_sort => 'relevance')),
  'a typo ("corol") still finds "Coral drop earrings"'
);
select lives_ok(
  $$select * from public.shop_search('en', p_terms => array['a&b|!c', '''', ':*', '(x)'])$$,
  'search words with tsquery syntax are words, never syntax'
);
select is(
  (select pg_temp.sorted(ids) from public.shop_search('en', p_materials => array['stainless-steel'])),
  pg_temp.ids(array['TEST-002', 'TEST-007']),
  'a material filter lists published products only (not the deleted TEST-014)'
);
select is(
  (select pg_temp.sorted(ids) from public.shop_search('en', p_materials => array['brass'], p_colours => array['gold-tone'], p_availability => array['made_to_order'])),
  pg_temp.ids(array['TEST-001', 'TEST-004']),
  'material, colour and availability filters combine'
);
select is(
  (select pg_temp.sorted(ids) from public.shop_search('en', p_availability => array['in_stock'])),
  pg_temp.ids(array['TEST-003', 'TEST-009']),
  'in stock: the available one-of-a-kind pieces, not the reserved or sold ones'
);
select is(
  (select pg_temp.skus(ids) || '/' || total from public.shop_search('en', p_price_min_minor => 2000, p_price_max_minor => 3000, p_sort => 'price_asc')),
  'TEST-006,TEST-001,TEST-007,TEST-009/4',
  'a price range in US cents, both bounds inclusive, sorted by price'
);
select is(
  (select pg_temp.skus(ids) || '/' || total from public.shop_search('en', p_category => 'earrings', p_limit => 2, p_offset => 1)),
  'TEST-002,TEST-003/3',
  'a category page: newest first, with the total'
);
select is(
  (select cardinality(ids) || '/' || total from public.shop_search('en', p_category => 'earrings', p_offset => 40)),
  '0/3',
  'a page past the end is empty and keeps the total'
);
select set_eq(
  $$select facet || ':' || value || '=' || count from public.shop_facets('en', p_materials => array['brass'])$$,
  array[
    'material:brass=4', 'material:synthetic-coral=3', 'material:stainless-steel=2', 'material:glass=2',
    'colour:gold-tone=3', 'colour:red=1', 'colour:silver-tone=1',
    'availability:made_to_order=3', 'availability:in_stock=1'
  ],
  'counts per option: each list counted under the other filters, not its own'
);
select throws_ok($$select * from public.shop_search('en', p_sort => 'random()')$$, '22023', null, 'an unknown sort is refused');
select throws_ok($$select * from public.shop_search('en', p_limit => 1000)$$, '22023', null, 'a page larger than 100 is refused');
select throws_ok($$select * from public.shop_search('en', p_availability => array['sold'])$$, '22023', null, 'an unknown availability is refused');
select throws_ok(
  $$select * from public.shop_search('en', p_terms => array['a','b','c','d','e','f','g','h','i'])$$,
  '22023', null, 'more than 8 search words are refused'
);
reset role;

select * from finish();
rollback;
