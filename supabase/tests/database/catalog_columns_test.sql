-- Internal catalog columns (attribution, soft delete, SKU, HS code) are not readable through the Data API
-- roles, even on published rows; the storefront columns are.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'customer-' || gen_random_uuid() || '@example.test');

insert into public.categories (id, slug) values ('c3000000-0000-4000-8000-000000000001', 'columns-category');
insert into public.products (id, category_id, status, sku, price_usd) values
  ('b3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'published', 'COL-001', 10);
insert into public.product_translations (product_id, locale, slug, title) values
  ('b3000000-0000-4000-8000-000000000001', 'en', 'columns-product', 'Columns');
insert into public.product_images (product_id, storage_path, width, height) values
  ('b3000000-0000-4000-8000-000000000001', 'test/columns.jpg', 10, 10);

create temp table hidden (stmt text) on commit drop;
insert into hidden values
  ($$select sku from public.products where id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select hs_code from public.products where id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select deleted_at from public.products where id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select created_by, updated_by from public.products where id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select created_by from public.categories where id = 'c3000000-0000-4000-8000-000000000001'$$),
  ($$select updated_by from public.product_translations where product_id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select created_by from public.product_images where product_id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select * from public.products$$),
  ($$select id from public.products where deleted_at is null$$);
grant select on hidden to anon, authenticated;

-- What the storefront data layer selects (src/lib/catalog/index.ts), without the internal columns.
create temp table visible (stmt text) on commit drop;
insert into visible values
  ($$select id, category_id, status, fulfillment, availability, lead_time_days, price_usd, weight_g, position, published_at, created_at, updated_at
     from public.products where id = 'b3000000-0000-4000-8000-000000000001'$$),
  ($$select id, slug, position from public.categories where id = 'c3000000-0000-4000-8000-000000000001'$$),
  ($$select product_id, locale, slug, title, description, materials, care, alt_text, meta_title, meta_description, source, reviewed_at
     from public.product_translations where product_id = 'b3000000-0000-4000-8000-000000000001'$$);
grant select on visible to anon, authenticated;

-- Anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(stmt, '42501', null, 'anon cannot run: ' || left(stmt, 60)) from hidden;
select isnt_empty(stmt, 'anon reads: ' || left(stmt, 60)) from visible;
reset role;

-- Customer
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(stmt, '42501', null, 'a customer cannot run: ' || left(stmt, 60)) from hidden;
select isnt_empty(stmt, 'a customer reads: ' || left(stmt, 60)) from visible;
reset role;

select * from finish();
rollback;
