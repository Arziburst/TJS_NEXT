-- Storage bucket product-images: public, image types only, 15 MiB (#18), writes by admins only.
-- Storage forbids direct DELETE on its tables, so deletes, MIME types and size are checked over HTTP in
-- tests/catalog/storage.integration.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images'$$,
  $$values (true, 15728640::bigint, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])$$,
  'product-images is public, 15 MiB, raster image types only'
);

-- Anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('product-images', 'anon.jpg')$$,
  '42501', null, 'anon cannot upload'
);
reset role;

-- Customer
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('product-images', 'customer.jpg', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'a customer cannot upload'
);
reset role;

-- Admin
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('product-images', 'admin.jpg', '22222222-2222-4222-8222-222222222222')$$,
  'an admin can upload'
);
select ok(exists (select 1 from storage.objects where bucket_id = 'product-images' and name = 'admin.jpg'), 'an admin lists the bucket');
reset role;

-- Customer against the admin's object: nothing visible, nothing changes.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select ok(not exists (select 1 from storage.objects where bucket_id = 'product-images'), 'a customer cannot list the bucket through the API');
select lives_ok(
  $$update storage.objects set name = 'hijacked.jpg' where bucket_id = 'product-images' and name = 'admin.jpg'$$,
  'a customer''s update is filtered by RLS'
);
reset role;
select ok(exists (select 1 from storage.objects where bucket_id = 'product-images' and name = 'admin.jpg'), 'the admin''s object is untouched');

-- Admin overwrite and delete
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$update storage.objects set metadata = '{"mimetype":"image/png"}' where bucket_id = 'product-images' and name = 'admin.jpg'$$,
  'an admin can update an object'
);
reset role;
select is(
  (select metadata ->> 'mimetype' from storage.objects where bucket_id = 'product-images' and name = 'admin.jpg'),
  'image/png',
  'the admin update took effect'
);

select * from finish();
rollback;
