-- Profiles: created on sign-up, role never writable through the API, is_admin() true only for admins.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Fixtures: a customer and an admin (the admin role is granted here, as the database owner).
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'customer-' || gen_random_uuid() || '@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin-' || gen_random_uuid() || '@example.test');

select is(
  (select role::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'customer',
  'sign-up creates a profile with role customer'
);

update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222222';

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'RLS is enabled on profiles'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure),
  'is_admin() is security definer'
);
select is(
  (select provolatile::text from pg_proc where oid = 'public.is_admin()'::regprocedure),
  's',
  'is_admin() is stable'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.is_admin()'::regprocedure),
  'is_admin() pins an empty search_path'
);

-- Customer
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is(public.is_admin(), false, 'is_admin() is false for a customer');

select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'a customer cannot update their own role'
);
select throws_ok(
  $$insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')$$,
  '42501',
  null,
  'a customer cannot insert a profile'
);
select throws_ok(
  $$delete from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'a customer cannot delete their profile'
);
select results_eq(
  $$select id from public.profiles$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'a customer sees only their own profile'
);

reset role;

select is(
  (select role::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'customer',
  'the customer is still a customer'
);

-- Admin: sees every profile, but cannot change roles through the API either.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is(public.is_admin(), true, 'is_admin() is true for an admin');
select is(
  (select count(*)::int from public.profiles
   where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
  2,
  'an admin sees other profiles'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'an admin cannot change a role through the API'
);

reset role;

-- Anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(public.is_admin(), false, 'is_admin() is false for anon');
select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'anon cannot read profiles'
);
select throws_ok(
  $$update public.profiles set role = 'admin'$$,
  '42501',
  null,
  'anon cannot update profiles'
);

reset role;

-- An authenticated user without a profile (or with a demoted one) is not an admin.
update public.profiles set role = 'customer' where id = '22222222-2222-4222-8222-222222222222';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(public.is_admin(), false, 'a demoted admin loses is_admin()');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(public.is_admin(), false, 'is_admin() is false for a user without a profile');
reset role;

select * from finish();
rollback;
