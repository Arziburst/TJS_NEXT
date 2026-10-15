-- Favorites: every shopper reads and writes only their own favorites, only of products they can see.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Fixtures: two customers. Seed products: TEST-001..004 published, TEST-011 draft, TEST-014 published but
-- soft-deleted.
insert into auth.users (id, email) values
  ('41111111-1111-4111-8111-111111111111', 'fav-a-' || gen_random_uuid() || '@example.test'),
  ('42222222-2222-4222-8222-222222222222', 'fav-b-' || gen_random_uuid() || '@example.test');

select is(
  (select relrowsecurity from pg_class where oid = 'public.favorites'::regclass),
  true,
  'RLS is enabled on favorites'
);

-- B's favorite, written as the database owner
insert into public.favorites (user_id, product_id)
values ('42222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000002');

-- anon
set local role anon;
select throws_ok($$select * from public.favorites$$, '42501', null, 'anon cannot read favorites');
select throws_ok(
  $$insert into public.favorites (user_id, product_id)
    values ('41111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'anon cannot write favorites'
);
reset role;

-- customer A
select set_config('request.jwt.claims', '{"sub":"41111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.favorites (product_id) values ('a0000000-0000-4000-8000-000000000001')$$,
  'a customer adds a favorite of their own (user_id defaults to them)'
);
select is(
  (select user_id from public.favorites where product_id = 'a0000000-0000-4000-8000-000000000001'),
  '41111111-1111-4111-8111-111111111111'::uuid,
  'the favorite belongs to the customer'
);
select results_eq(
  $$select product_id from public.favorites$$,
  $$values ('a0000000-0000-4000-8000-000000000001'::uuid)$$,
  'a customer sees only their own favorites, not another customer''s'
);
select throws_ok(
  $$insert into public.favorites (user_id, product_id)
    values ('42222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000003')$$,
  '42501',
  null,
  'a customer cannot add a favorite for another customer'
);
select throws_ok(
  $$insert into public.favorites (product_id) values ('a0000000-0000-4000-8000-000000000011')$$,
  '42501',
  null,
  'a customer cannot add a draft product'
);
select throws_ok(
  $$insert into public.favorites (product_id) values ('a0000000-0000-4000-8000-000000000014')$$,
  '42501',
  null,
  'a customer cannot add a soft-deleted product'
);
select throws_ok(
  $$insert into public.favorites (product_id) values ('a0000000-0000-4000-8000-000000000001')$$,
  '23505',
  null,
  'a product is a favorite once'
);
select lives_ok(
  $$insert into public.favorites (product_id) values ('a0000000-0000-4000-8000-000000000001') on conflict do nothing$$,
  'adding a favorite again is a no-op (the merge after sign-in relies on it)'
);
select throws_ok(
  $$update public.favorites set user_id = '42222222-2222-4222-8222-222222222222'
    where product_id = 'a0000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a customer cannot hand a favorite to another customer'
);

delete from public.favorites where user_id = '42222222-2222-4222-8222-222222222222';
reset role;

select is(
  (select count(*)::int from public.favorites where user_id = '42222222-2222-4222-8222-222222222222'),
  1,
  'another customer''s favorite cannot be deleted'
);

-- customer B, after A's changes
select set_config('request.jwt.claims', '{"sub":"42222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select product_id from public.favorites$$,
  $$values ('a0000000-0000-4000-8000-000000000002'::uuid)$$,
  'the other customer sees only their own favorite'
);
select lives_ok(
  $$delete from public.favorites where product_id = 'a0000000-0000-4000-8000-000000000002'$$,
  'a customer removes their own favorite'
);
reset role;

select is(
  (select count(*)::int from public.favorites where user_id = '42222222-2222-4222-8222-222222222222'),
  0,
  'the removal was kept'
);

delete from auth.users where id = '41111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.favorites where user_id = '41111111-1111-4111-8111-111111111111'),
  0,
  'a deleted account takes its favorites with it'
);

select * from finish();
rollback;
