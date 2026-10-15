-- #18: the private staging bucket for photo uploads and the admin's photo functions. Uploads through signed
-- URLs, deletes and the checks by content run over HTTP in tests/admin/images.integration.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin-' || gen_random_uuid() || '@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'admin2-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin'
where id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.products (id, category_id, sku, status, price_usd)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'PGTAP-18-' || gen_random_uuid(), 'draft', 10
from public.categories where slug = 'rings';

select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-image-uploads'$$,
  $$values (false, 15728640::bigint, null::text[])$$,
  'product-image-uploads is private, 15 MiB, any claimed type (#92: the server decides by the bytes)'
);

-- Anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('product-image-uploads', 'anon/a.jpg')$$,
  '42501', null, 'anon cannot stage'
);
select throws_ok(
  $$select public.admin_add_product_image('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'anon.jpg', 1, 1, null)$$,
  '42501', null, 'anon cannot call admin_add_product_image'
);
select throws_ok(
  $$select public.admin_reorder_product_images('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}')$$,
  '42501', null, 'anon cannot call admin_reorder_product_images'
);
reset role;

-- Customer
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('product-image-uploads', '11111111-1111-4111-8111-111111111111/c.jpg', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'a customer cannot stage, not even in a folder of their own'
);
select throws_ok(
  $$select public.admin_add_product_image('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'customer.jpg', 1, 1, null)$$,
  '42501', null, 'a customer cannot add a photo'
);
reset role;

-- Admin
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('product-image-uploads', '22222222-2222-4222-8222-222222222222/a.jpg', '22222222-2222-4222-8222-222222222222')$$,
  'an admin stages in their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('product-image-uploads', '33333333-3333-4333-8333-333333333333/a.jpg', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'an admin cannot stage in another admin''s folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('product-image-uploads', 'a.jpg', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'an admin cannot stage outside a folder'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'product-image-uploads'),
  1, 'an admin sees their staged file'
);
select lives_ok(
  $$select public.admin_add_product_image('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pgtap-18/one.jpg', 30, 60, null)$$,
  'an admin adds a photo'
);
select lives_ok(
  $$select public.admin_add_product_image('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pgtap-18/two.jpg', 40, 40, 'data:image/png;base64,AA==')$$,
  'an admin adds a second photo'
);
select results_eq(
  $$select storage_path, position from public.product_images
    where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by position$$,
  $$values ('pgtap-18/one.jpg', 0), ('pgtap-18/two.jpg', 1)$$,
  'a new photo goes last'
);
select throws_ok(
  $$select public.admin_add_product_image(gen_random_uuid(), 'pgtap-18/none.jpg', 1, 1, null)$$,
  'P0002', null, 'a photo of an unknown product is refused'
);
select throws_ok(
  $$select public.admin_reorder_product_images('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    array[(select id from public.product_images where storage_path = 'pgtap-18/two.jpg')])$$,
  '40001', null, 'an order missing a photo is refused'
);
select lives_ok(
  $$select public.admin_reorder_product_images('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', array(
    select id from public.product_images where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by position desc))$$,
  'an admin reorders the photos'
);
select results_eq(
  $$select storage_path from public.product_images where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by position$$,
  $$values ('pgtap-18/two.jpg'), ('pgtap-18/one.jpg')$$,
  'the second photo is the main one now'
);
select ok(
  public.admin_save_image_alts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    (select id from public.product_images where storage_path = 'pgtap-18/two.jpg'),
    '[{"locale":"uk","alt":"Каблучка"},{"locale":"en","alt":"Ring"}]'),
  'an admin saves alt texts'
);
reset role;
-- the audit columns are not readable by the API roles
select ok(
  (select bool_and(created_by = '22222222-2222-4222-8222-222222222222') from public.product_images
   where product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'the photos are attributed to the admin'
);

-- Another admin sees nothing of the first admin's staging folder.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'product-image-uploads'),
  0, 'another admin cannot list a staged file that is not theirs'
);
reset role;

-- A customer changes nothing.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_reorder_product_images('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}')$$,
  '42501', null, 'a customer cannot reorder'
);
select throws_ok(
  $$select public.admin_save_image_alts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), '[]')$$,
  '42501', null, 'a customer cannot change alt texts'
);
reset role;
select results_eq(
  $$select a.locale::text, a.alt from public.product_image_alts a
    join public.product_images i on i.id = a.image_id
    where i.product_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by a.locale$$,
  $$values ('en', 'Ring'), ('uk', 'Каблучка')$$,
  'the admin''s alt texts are untouched'
);

select * from finish();
rollback;
