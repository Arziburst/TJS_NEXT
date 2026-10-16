-- The customer account (#28): a customer edits their own first and last name (never another profile), and keeps
-- up to five saved delivery destinations of their own, one of them the default; nobody else reads or changes
-- them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (id, email) values
  ('71111111-1111-4111-8111-111111111111', 'acc-a-' || gen_random_uuid() || '@example.test'),
  ('72222222-2222-4222-8222-222222222222', 'acc-b-' || gen_random_uuid() || '@example.test');

select is(
  (select relrowsecurity from pg_class where oid = 'public.saved_addresses'::regclass),
  true,
  'RLS is enabled on saved_addresses'
);

-- Profile column rules (as the owner)
select throws_ok(
  $$update public.profiles set first_name = '  ' where id = '71111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'a first name cannot be blank'
);
select throws_ok(
  $$update public.profiles set last_name = repeat('a', 101) where id = '71111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'a last name is at most 100 characters'
);

-- B's address, written as the database owner
insert into public.saved_addresses (user_id, label, country, delivery) values (
  '72222222-2222-4222-8222-222222222222', 'B home', 'DE',
  '{"kind": "novaPostAddress", "country": "DE", "city": "Berlin", "postCode": "10115", "street": "Invalidenstr.", "building": "1", "flat": null}'
);

-- anon ---------------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.saved_addresses$$, '42501', null, 'anon cannot read saved addresses');
select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('DE', '{"kind": "novaPostAddress", "country": "DE"}')$$,
  '42501', null, 'anon cannot save an address'
);
select throws_ok(
  $$update public.profiles set first_name = 'Anon'$$,
  '42501', null, 'anon cannot update a first name'
);
reset role;

-- customer A ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$update public.profiles set first_name = 'Anna Maria', last_name = 'Schmidt', name = 'Anna Maria Schmidt'
    where id = '71111111-1111-4111-8111-111111111111'$$,
  'a customer updates their own first and last name'
);
select is(
  (select array[first_name, last_name, name] from public.profiles where id = '71111111-1111-4111-8111-111111111111'),
  array['Anna Maria', 'Schmidt', 'Anna Maria Schmidt'],
  'the own update took effect'
);
select lives_ok(
  $$update public.profiles set first_name = 'Hacked' where id = '72222222-2222-4222-8222-222222222222'$$,
  'an update of another profile''s first name is filtered by RLS (checked below)'
);

select lives_ok(
  $$insert into public.saved_addresses (label, country, delivery) values ('Kyiv branch', 'UA',
    '{"kind": "novaPoshtaWarehouse", "city": {"ref": "e718a680-4b33-11e4-ab6d-005056801329", "cityRef": "8d5a980d-391c-11dd-90d9-001a92567626", "label": "Kyiv"}, "warehouse": {"ref": "1ec09d88-e1c2-11e3-8c4a-0050568002cf", "kind": "branch", "number": 1, "name": "Branch 1"}}')$$,
  'a customer saves an address of their own (user_id defaults to them)'
);
select is(
  (select array[user_id::text, is_default::text] from public.saved_addresses where label = 'Kyiv branch'),
  array['71111111-1111-4111-8111-111111111111', 'true'],
  'the address belongs to the customer, and the first one becomes the default'
);
select lives_ok(
  $$insert into public.saved_addresses (label, country, delivery) values ('Berlin', 'DE',
    '{"kind": "novaPostAddress", "country": "DE", "city": "Berlin", "postCode": "10115", "street": "Invalidenstr.", "building": "2", "flat": null}')$$,
  'a second address'
);
select is(
  (select is_default from public.saved_addresses where label = 'Berlin'),
  false,
  'a later address is not the default'
);
select lives_ok(
  $$update public.saved_addresses set is_default = true where label = 'Berlin'$$,
  'a customer makes another address the default'
);
select results_eq(
  $$select label from public.saved_addresses where is_default$$,
  $$values ('Berlin'::text)$$,
  'the new default took the mark from the previous one: one default'
);
select results_eq(
  $$select label from public.saved_addresses order by created_at$$,
  $$values ('Kyiv branch'::text), ('Berlin'::text)$$,
  'a customer sees only their own addresses, not another customer''s'
);

-- spoofing and other customers' rows
select throws_ok(
  $$insert into public.saved_addresses (user_id, country, delivery) values ('72222222-2222-4222-8222-222222222222', 'DE',
    '{"kind": "novaPostAddress", "country": "DE"}')$$,
  '42501', null, 'a customer cannot save an address for another customer'
);
select lives_ok(
  $$update public.saved_addresses set label = 'Hacked', is_default = true where label = 'B home'$$,
  'an update of another customer''s address is filtered by RLS (checked below)'
);
select lives_ok(
  $$delete from public.saved_addresses where label = 'B home'$$,
  'a delete of another customer''s address is filtered by RLS (checked below)'
);
select throws_ok(
  $$update public.saved_addresses set user_id = '72222222-2222-4222-8222-222222222222' where label = 'Berlin'$$,
  '42501', null, 'a customer cannot hand an address to another customer'
);
select throws_ok(
  $$update public.saved_addresses set delivery = '{"kind": "novaPostAddress", "country": "DE"}' where label = 'Berlin'$$,
  '42501', null, 'a saved destination is not edited in place'
);

-- shape rules
select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('GB', '{"kind": "novaPostAddress", "country": "GB"}')$$,
  '23514', null, 'no UK address (D2)'
);
select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('DE', '{"kind": "novaPoshtaWarehouse"}')$$,
  '23514', null, 'Nova Poshta only in Ukraine'
);
select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('DE', '{"kind": "novaPostAddress", "country": "PL"}')$$,
  '23514', null, 'the choice names the same country'
);
select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('DE', '{"kind": "pigeon", "country": "DE"}')$$,
  '23514', null, 'an unknown kind of delivery is refused'
);

-- the limit: five per customer
select lives_ok(
  $$insert into public.saved_addresses (country, delivery)
    select 'PL', '{"kind": "novaPostAddress", "country": "PL"}'::jsonb from generate_series(1, 3)$$,
  'three more addresses: five in all'
);
select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('PL', '{"kind": "novaPostAddress", "country": "PL"}')$$,
  'TJ429', null, 'a sixth address is refused'
);

-- deleting the default promotes the oldest remaining one
select lives_ok($$delete from public.saved_addresses where label = 'Berlin'$$, 'a customer deletes their default address');
select results_eq(
  $$select label from public.saved_addresses where is_default$$,
  $$values ('Kyiv branch'::text)$$,
  'the oldest remaining address became the default'
);
select is((select count(*)::int from public.saved_addresses), 4, 'four addresses are left');

select throws_ok(
  $$insert into public.saved_addresses (country, delivery) values ('UA', '{"kind": "novaPoshtaWarehouse"}');
    insert into public.saved_addresses (country, delivery) values ('UA', '{"kind": "novaPoshtaWarehouse"}')$$,
  'TJ429', null, 'room for one more, not for two'
);

reset role;

-- what customer A could not touch
select is(
  (select first_name from public.profiles where id = '72222222-2222-4222-8222-222222222222'),
  null,
  'the other profile''s first name is unchanged'
);
select is(
  (select array[label, is_default::text] from public.saved_addresses where user_id = '72222222-2222-4222-8222-222222222222'),
  array['B home', 'true'],
  'the other customer''s address is unchanged and not deleted'
);

-- customer B sees only theirs
select set_config('request.jwt.claims', '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select label from public.saved_addresses$$,
  $$values ('B home'::text)$$,
  'the other customer sees only their own address'
);
select is_empty(
  $$select id from public.saved_addresses where user_id = '71111111-1111-4111-8111-111111111111'$$,
  'and none of customer A''s'
);
reset role;

-- a deleted account takes its addresses along
delete from auth.users where id = '71111111-1111-4111-8111-111111111111';
select is(
  (select count(*)::int from public.saved_addresses where user_id = '71111111-1111-4111-8111-111111111111'),
  0,
  'a deleted account''s addresses are gone'
);
select is(
  (select count(*)::int from public.saved_addresses),
  1,
  'only the other customer''s address is left'
);

select * from finish();
rollback;
