-- The customer's status history (#108): own_order_status_history returns the steps of the caller's own order
-- (the placement, then every change), oldest first, with the status and the time only; another customer, a guest
-- order, an unknown number and an anonymous caller get nothing, and the history table stays closed to customers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixtures: an admin, two customers. Seed product TEST-001: published, made to order.
insert into auth.users (id, email) values
  ('60000000-0000-4000-8000-000000000108', 'history-admin-' || gen_random_uuid() || '@example.test'),
  ('61111111-1111-4111-8111-111111111108', 'history-a-' || gen_random_uuid() || '@example.test'),
  ('62222222-2222-4222-8222-222222222108', 'history-b-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin', name = 'Owner' where id = '60000000-0000-4000-8000-000000000108';

create function pg_temp.place(p_key uuid, p_user uuid) returns bigint
language sql as $$
  select public.create_order_request(
    jsonb_build_object(
      'idempotency_key', p_key, 'user_id', p_user, 'locale', 'uk',
      'first_name', 'Olena', 'last_name', 'Koval', 'phone', '+380501234567', 'email', 'olena@example.test',
      'comment', null, 'country', 'UA', 'delivery_carrier', 'nova_poshta', 'delivery_method', 'warehouse',
      'delivery_destination', jsonb_build_object('city', 'Kyiv'),
      'delivery_estimate_state', 'tbd', 'delivery_estimate_source', 'flat_rate',
      'delivery_estimate_minor', null, 'delivery_estimate_currency', null, 'delivery_estimate_decimals', null,
      'currency', 'UAH', 'currency_decimals', 0, 'fx_rate', '41.5', 'fx_rate_date', '2026-10-16', 'markup_bps', 300,
      'items_total_usd_minor', 1000, 'items_total_minor', 430
    ),
    jsonb_build_array(jsonb_build_object(
      'product_id', 'a0000000-0000-4000-8000-000000000001', 'variant_id', null, 'position', 0, 'title', 'Piece',
      'title_locale', 'uk', 'quantity', 1, 'unit_price_usd_minor', 1000, 'unit_price_minor', 430
    ))
  );
  select number from public.orders where idempotency_key = p_key;
$$;

-- the numbers, read before any role switch: RLS would hide another's order from number_of and make a negative
-- test pass on a null number
create temp table order_numbers (idempotency_key uuid primary key, number bigint not null);
grant select on order_numbers to authenticated, anon;

create function pg_temp.number_of(p_key uuid) returns bigint
language sql as $$ select number from order_numbers where idempotency_key = p_key $$;

create function pg_temp.as_user(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- OA1: customer A, moved new → in processing → accepted; OA2: customer A, never changed; OG: a guest's order,
-- moved to in processing; OB: customer B's own order
select pg_temp.place('71111111-1111-4111-8111-111111111108', '61111111-1111-4111-8111-111111111108');
select pg_temp.place('71111111-2222-4111-8111-111111111108', '61111111-1111-4111-8111-111111111108');
select pg_temp.place('72222222-2222-4222-8222-222222222108', null);
select pg_temp.place('73333333-3333-4333-8333-333333333108', '62222222-2222-4222-8222-222222222108');
insert into order_numbers select idempotency_key, number from public.orders where idempotency_key in (
  '71111111-1111-4111-8111-111111111108', '71111111-2222-4111-8111-111111111108',
  '72222222-2222-4222-8222-222222222108', '73333333-3333-4333-8333-333333333108'
);

select pg_temp.as_user('60000000-0000-4000-8000-000000000108');
set local role authenticated;
select public.admin_set_order_status(pg_temp.number_of('71111111-1111-4111-8111-111111111108'), 'new', 'in_processing');
select public.admin_set_order_status(pg_temp.number_of('71111111-1111-4111-8111-111111111108'), 'in_processing', 'accepted');
select public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222108'), 'new', 'in_processing');
reset role;

-- One transaction stamps every change with the same now(): spread OA1's steps over the day, as separate
-- requests would (placed 10:00, in processing 11:00, accepted 12:00 UTC)
alter table public.orders disable trigger orders_timestamps;
update public.orders set created_at = '2026-10-15 10:00:00+00'
 where idempotency_key = '71111111-1111-4111-8111-111111111108';
alter table public.orders enable trigger orders_timestamps;
update public.order_status_history h
   set created_at = case h.to_status when 'in_processing' then '2026-10-15 11:00:00+00'::timestamptz
                                     else '2026-10-15 12:00:00+00'::timestamptz end
  from public.orders o
 where o.id = h.order_id and o.idempotency_key = '71111111-1111-4111-8111-111111111108';

-- The function's shape --------------------------------------------------------------------------------------------
select is(
  (select prosecdef from pg_proc where oid = 'public.own_order_status_history(bigint)'::regprocedure),
  true,
  'own_order_status_history is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.own_order_status_history(bigint)'::regprocedure),
  array['search_path=""'],
  'it runs with an empty search_path'
);
select is(
  pg_get_function_result('public.own_order_status_history(bigint)'::regprocedure),
  'TABLE(status order_status, changed_at timestamp with time zone)',
  'it answers the status and its time only: no author, note or id'
);
select is(has_function_privilege('anon', 'public.own_order_status_history(bigint)', 'execute'), false, 'anon cannot run it');
select is(
  has_function_privilege('authenticated', 'public.own_order_status_history(bigint)', 'execute'), true, 'a signed-in user can run it'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.order_status_history'::regclass), true, 'RLS stays on order_status_history'
);

-- Customer A, the owner -----------------------------------------------------------------------------------------
select pg_temp.as_user('61111111-1111-4111-8111-111111111108');
set local role authenticated;

select is(
  (select array_agg(h.status::text) from public.own_order_status_history(pg_temp.number_of('71111111-1111-4111-8111-111111111108')) h),
  array['new', 'in_processing', 'accepted'],
  'the owner reads the placement and every change, oldest first'
);
select is(
  (select array_agg(h.changed_at) from public.own_order_status_history(pg_temp.number_of('71111111-1111-4111-8111-111111111108')) h),
  array['2026-10-15 10:00:00+00', '2026-10-15 11:00:00+00', '2026-10-15 12:00:00+00']::timestamptz[],
  'each step carries its time: the placement, then each change'
);
select is(
  (select jsonb_agg(to_jsonb(h)) from public.own_order_status_history(pg_temp.number_of('71111111-2222-4111-8111-111111111108')) h),
  (select jsonb_build_array(jsonb_build_object('status', 'new', 'changed_at', o.created_at))
     from public.orders o where o.idempotency_key = '71111111-2222-4111-8111-111111111108'),
  'an order never changed reads as its placement alone'
);
select is(
  (select count(*)::int from public.own_order_status_history(pg_temp.number_of('72222222-2222-4222-8222-222222222108'))),
  0,
  'a guest''s order reads as no steps'
);
select is(
  (select count(*)::int from public.own_order_status_history(pg_temp.number_of('73333333-3333-4333-8333-333333333108'))),
  0,
  'another customer''s order reads as no steps'
);
select is((select count(*)::int from public.own_order_status_history(999999999)), 0, 'an unknown number reads as no steps');
select is((select count(*)::int from public.order_status_history), 0, 'the owner still reads no history row directly');

-- Customer B ---------------------------------------------------------------------------------------------------
select pg_temp.as_user('62222222-2222-4222-8222-222222222108');

select is(
  (select count(*)::int from public.own_order_status_history(pg_temp.number_of('71111111-1111-4111-8111-111111111108'))),
  0,
  'customer B reads none of A''s steps'
);
select is(
  (select array_agg(h.status::text) from public.own_order_status_history(pg_temp.number_of('73333333-3333-4333-8333-333333333108')) h),
  array['new'],
  'customer B reads their own order'
);

-- An admin reads the full history through the admin pages, not through the customer's path ---------------------
select pg_temp.as_user('60000000-0000-4000-8000-000000000108');

select is(
  (select count(*)::int from public.own_order_status_history(pg_temp.number_of('71111111-1111-4111-8111-111111111108'))),
  0,
  'an admin gets no customer''s steps through it (only their own orders)'
);

-- A signed-in user without a subject, and anon ------------------------------------------------------------------
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.own_order_status_history(pg_temp.number_of('72222222-2222-4222-8222-222222222108'))),
  0,
  'without a user id even a guest''s order (user_id null) reads as no steps'
);

reset role;
select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
set local role anon;

select throws_ok(
  format('select * from public.own_order_status_history(%s)', pg_temp.number_of('71111111-1111-4111-8111-111111111108')),
  '42501',
  null,
  'anon is refused the function'
);
select throws_ok(
  format('select * from public.own_order_status_history(%s)', pg_temp.number_of('72222222-2222-4222-8222-222222222108')),
  '42501',
  null,
  'anon is refused a guest''s order too'
);
select throws_ok('select count(*) from public.order_status_history', '42501', null, 'anon cannot read the history table');

select * from finish();
rollback;
