-- Profiles after auth (#13): sign-up metadata fills name and phone; a customer edits only their own name and
-- phone, never the role and never another profile; the rate limit counter belongs to the service role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures: two customers, one signed up with valid metadata, one with metadata that breaks the rules.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'one-' || gen_random_uuid() || '@example.test',
   '{"name": "  Olena Koval ", "phone": "+380946826242", "role": "admin"}'),
  ('22222222-2222-4222-8222-222222222222', 'two-' || gen_random_uuid() || '@example.test',
   '{"full_name": "Google User", "phone": "not a phone"}'),
  ('33333333-3333-4333-8333-333333333333', 'three-' || gen_random_uuid() || '@example.test', null);

select is(
  (select array[name, phone, role::text] from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  array['Olena Koval', '+380946826242', 'customer'],
  'sign-up metadata fills name and phone (trimmed); a role in the metadata is ignored'
);
select is(
  (select array[name, phone] from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  array['Google User', null],
  'a Google full_name becomes the name; an invalid phone is dropped, not the sign-up'
);
select is(
  (select array[name, phone] from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  array[null, null]::text[],
  'a sign-up without metadata gets an empty profile'
);

-- Column rules (as the owner)
select throws_ok(
  $$update public.profiles set phone = '0946826242' where id = '33333333-3333-4333-8333-333333333333'$$,
  '23514', null, 'a phone must be in international format'
);
select throws_ok(
  $$update public.profiles set name = '   ' where id = '33333333-3333-4333-8333-333333333333'$$,
  '23514', null, 'a name cannot be blank'
);
select throws_ok(
  $$update public.profiles set name = repeat('a', 101) where id = '33333333-3333-4333-8333-333333333333'$$,
  '23514', null, 'a name is at most 100 characters'
);

-- Customer one ----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update public.profiles set name = 'Olena K.', phone = '+48500600700' where id = '11111111-1111-4111-8111-111111111111'$$,
  'a customer updates their own name and phone'
);
select is(
  (select array[name, phone] from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  array['Olena K.', '+48500600700'],
  'the own update took effect'
);
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a customer cannot change their own role'
);
select throws_ok(
  $$update public.profiles set name = 'X', role = 'admin' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a customer cannot change their role together with their name'
);
select throws_ok(
  $$update public.profiles set id = '33333333-3333-4333-8333-333333333333' where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a customer cannot move their profile to another id'
);
select throws_ok(
  $$update public.profiles set created_at = now() where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a customer cannot change created_at'
);
select is_empty(
  $$select id from public.profiles where id <> '11111111-1111-4111-8111-111111111111'$$,
  'a customer cannot read another profile'
);
select lives_ok(
  $$update public.profiles set name = 'Hacked', phone = '+380000000000'
    where id = '22222222-2222-4222-8222-222222222222'$$,
  'an update of another profile is filtered by RLS (checked below)'
);
select throws_ok(
  $$insert into public.profiles (id) values ('44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'a customer cannot insert a profile'
);
select throws_ok(
  $$delete from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'a customer cannot delete a profile'
);
select is(public.is_admin(), false, 'the customer is still not an admin');

-- The rate limit counter: no API user may call it or see its table.
select throws_ok(
  $$select public.consume_rate_limit('sign-in:x', 15, 300)$$,
  '42501', null, 'a customer cannot call consume_rate_limit'
);
select throws_ok(
  $$select * from private.rate_limit_hits$$,
  '42501', null, 'a customer cannot read the rate limit table'
);

reset role;

select is(
  (select array[name, phone, role::text] from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  array['Google User', null, 'customer'],
  'the other profile is unchanged'
);
select is(
  (select role::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'customer',
  'the customer is still a customer'
);

-- Anon ------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$update public.profiles set name = 'Anon'$$,
  '42501', null, 'anon cannot update profiles'
);
select throws_ok(
  $$select public.consume_rate_limit('sign-in:x', 15, 300)$$,
  '42501', null, 'anon cannot call consume_rate_limit'
);
reset role;

-- Service role: counts within a window and refuses past the maximum.
set local role service_role;
select is(
  (select array_agg(public.consume_rate_limit('test:' || '55555555-5555-4555-8555-555555555555', 2, 300)) from generate_series(1, 3)),
  array[true, true, false],
  'the service role counts hits: two allowed, the third refused'
);
select is(
  public.consume_rate_limit('test:other-key', 2, 300),
  true,
  'another key has its own budget'
);
select throws_ok(
  $$select public.consume_rate_limit('test:bad', 0, 300)$$,
  '22023', null, 'a maximum below 1 is refused'
);
reset role;
select is(
  (select hits from private.rate_limit_hits where key = 'test:55555555-5555-4555-8555-555555555555'),
  3,
  'every attempt is counted, refused ones included'
);

select * from finish();
rollback;
