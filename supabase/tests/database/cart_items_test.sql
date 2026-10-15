-- Cart items: every shopper reads and writes only their own lines, only for products they can see.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Fixtures: two customers. Seed products: TEST-001 published (made to order), TEST-011 draft,
-- TEST-014 published but soft-deleted.
insert into auth.users (id, email) values
  ('31111111-1111-4111-8111-111111111111', 'cart-a-' || gen_random_uuid() || '@example.test'),
  ('32222222-2222-4222-8222-222222222222', 'cart-b-' || gen_random_uuid() || '@example.test');

select is(
  (select relrowsecurity from pg_class where oid = 'public.cart_items'::regclass),
  true,
  'RLS is enabled on cart_items'
);

-- B's line, written as the database owner
insert into public.cart_items (user_id, product_id, quantity)
values ('32222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000002', 1);

-- anon
set local role anon;
select throws_ok($$select * from public.cart_items$$, '42501', null, 'anon cannot read cart items');
select throws_ok(
  $$insert into public.cart_items (user_id, product_id, quantity)
    values ('31111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 1)$$,
  '42501',
  null,
  'anon cannot write cart items'
);
reset role;

-- customer A
select set_config('request.jwt.claims', '{"sub":"31111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.cart_items (product_id, quantity) values ('a0000000-0000-4000-8000-000000000001', 2)$$,
  'a customer adds a line to their own cart (user_id defaults to them)'
);
select is(
  (select user_id from public.cart_items where product_id = 'a0000000-0000-4000-8000-000000000001'),
  '31111111-1111-4111-8111-111111111111'::uuid,
  'the line belongs to the customer'
);
select results_eq(
  $$select product_id from public.cart_items$$,
  $$values ('a0000000-0000-4000-8000-000000000001'::uuid)$$,
  'a customer sees only their own lines, not another customer''s'
);
select throws_ok(
  $$insert into public.cart_items (user_id, product_id, quantity)
    values ('32222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000003', 1)$$,
  '42501',
  null,
  'a customer cannot add a line to another customer''s cart'
);
select throws_ok(
  $$insert into public.cart_items (product_id, quantity) values ('a0000000-0000-4000-8000-000000000011', 1)$$,
  '42501',
  null,
  'a customer cannot add a draft product'
);
select throws_ok(
  $$insert into public.cart_items (product_id, quantity) values ('a0000000-0000-4000-8000-000000000014', 1)$$,
  '42501',
  null,
  'a customer cannot add a soft-deleted product'
);
select throws_ok(
  $$insert into public.cart_items (product_id, quantity) values ('a0000000-0000-4000-8000-000000000001', 1)$$,
  '23505',
  null,
  'one line per product and variant'
);
select throws_ok(
  $$insert into public.cart_items (product_id, quantity) values ('a0000000-0000-4000-8000-000000000004', 0)$$,
  '23514',
  null,
  'a quantity is at least 1'
);
select lives_ok(
  $$update public.cart_items set quantity = 3 where product_id = 'a0000000-0000-4000-8000-000000000001'$$,
  'a customer changes the quantity of their own line'
);
select throws_ok(
  $$update public.cart_items set user_id = '32222222-2222-4222-8222-222222222222'
    where product_id = 'a0000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a customer cannot hand their line to another customer'
);

update public.cart_items set quantity = 5 where user_id = '32222222-2222-4222-8222-222222222222';
delete from public.cart_items where user_id = '32222222-2222-4222-8222-222222222222';
reset role;

select is(
  (select quantity from public.cart_items where user_id = '32222222-2222-4222-8222-222222222222'),
  1,
  'another customer''s line cannot be updated'
);
select is(
  (select count(*)::int from public.cart_items where user_id = '32222222-2222-4222-8222-222222222222'),
  1,
  'another customer''s line cannot be deleted'
);
select is(
  (select quantity from public.cart_items where user_id = '31111111-1111-4111-8111-111111111111'),
  3,
  'the customer''s own update was kept'
);

-- customer B, after A's changes
select set_config('request.jwt.claims', '{"sub":"32222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select product_id from public.cart_items$$,
  $$values ('a0000000-0000-4000-8000-000000000002'::uuid)$$,
  'the other customer sees only their own line'
);
select lives_ok(
  $$delete from public.cart_items where product_id = 'a0000000-0000-4000-8000-000000000002'$$,
  'a customer removes their own line'
);
reset role;

delete from auth.users where id = '31111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.cart_items where user_id = '31111111-1111-4111-8111-111111111111'),
  0,
  'a deleted account takes its cart with it'
);

select * from finish();
rollback;
