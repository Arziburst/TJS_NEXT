-- Order requests: only the server writes them (create_order_request, service role), in one transaction with the
-- reservation of one-of-a-kind pieces; a customer reads only their own orders and lines, a guest none.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- Fixtures: two customers. Seed products: TEST-001 published made to order ($24.90), TEST-003 and TEST-009
-- published one of a kind (available), TEST-005 reserved, TEST-008 sold, TEST-011 draft, TEST-014 soft-deleted.
insert into auth.users (id, email) values
  ('41111111-1111-4111-8111-111111111111', 'orders-a-' || gen_random_uuid() || '@example.test'),
  ('42222222-2222-4222-8222-222222222222', 'orders-b-' || gen_random_uuid() || '@example.test');

-- An order request as the server builds it: one line per product id, each at $10.00 = 10.30 EUR (test values).
create function pg_temp.order_json(p_key uuid, p_user uuid, p_lines integer) returns jsonb
language sql as $$
  select jsonb_build_object(
    'idempotency_key', p_key, 'user_id', p_user, 'guest_access_hash', repeat('a', 64), 'locale', 'en',
    'first_name', 'Olena', 'last_name', null, 'phone', '+380501234567', 'email', 'olena@example.test',
    'comment', null, 'country', 'DE', 'delivery_carrier', 'nova_post', 'delivery_method', 'division',
    'delivery_destination', jsonb_build_object('divisionId', 1),
    'delivery_estimate_state', 'amount', 'delivery_estimate_source', 'carrier',
    'delivery_estimate_minor', 1290, 'delivery_estimate_currency', 'EUR',
    'currency', 'EUR', 'currency_decimals', 2, 'fx_rate', '0.92', 'fx_rate_date', '2026-10-16', 'markup_bps', 300,
    'items_total_usd_minor', 1000 * p_lines, 'items_total_minor', 1030 * p_lines
  );
$$;

create function pg_temp.line(p_product uuid, p_position integer) returns jsonb
language sql as $$
  select jsonb_build_object(
    'product_id', p_product, 'variant_id', null, 'position', p_position, 'title', 'Piece ' || p_position,
    'title_locale', 'en', 'quantity', 1, 'unit_price_usd_minor', 1000, 'unit_price_minor', 1030
  );
$$;

select is((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), true, 'RLS is enabled on orders');
select is((select relrowsecurity from pg_class where oid = 'public.order_items'::regclass), true, 'RLS is enabled on order_items');
select is((select relrowsecurity from pg_class where oid = 'public.outbox_events'::regclass), true, 'RLS is enabled on outbox_events');

-- The server (the function owner stands in for the service role) ------------------------------------------

select is(
  public.create_order_request(
    pg_temp.order_json('51111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 2),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0), pg_temp.line('a0000000-0000-4000-8000-000000000009', 1))
  ) - 'order_id' - 'number',
  jsonb_build_object('ok', true, 'replayed', false, 'user_id', '41111111-1111-4111-8111-111111111111'),
  'customer A places a request with a made-to-order line and a one-of-a-kind piece'
);
select is(
  (select status::text from public.orders where idempotency_key = '51111111-1111-4111-8111-111111111111'),
  'new',
  'a new request has the status new (D17)'
);
select ok(
  (select number >= 10001 from public.orders where idempotency_key = '51111111-1111-4111-8111-111111111111'),
  'the request gets a public number'
);
select is(
  (select availability::text from public.products where id = 'a0000000-0000-4000-8000-000000000009'),
  'reserved',
  'the one-of-a-kind piece is reserved with the order'
);
select is(
  (select availability::text from public.products where id = 'a0000000-0000-4000-8000-000000000001'),
  'available',
  'a made-to-order product needs no reservation'
);
select results_eq(
  $$select i.position::int, i.fulfillment::text, i.sku, i.line_total_minor::int
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.idempotency_key = '51111111-1111-4111-8111-111111111111' order by i.position$$,
  $$values (0, 'made_to_order', 'TEST-001', 1030), (1, 'one_of_a_kind', 'TEST-009', 1030)$$,
  'the lines are stored with the fulfillment and SKU read from the product'
);
select is(
  (select count(*)::int from public.outbox_events e join public.orders o on o.id = e.order_id
   where o.idempotency_key = '51111111-1111-4111-8111-111111111111' and e.event = 'order_created'
     and e.payload ->> 'number' = o.number::text and e.processed_at is null),
  1,
  'one order_created outbox row is written with the order'
);

-- the same attempt again (a double click, a retry): the same order, nothing new
select is(
  (public.create_order_request(
    pg_temp.order_json('51111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 2),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0), pg_temp.line('a0000000-0000-4000-8000-000000000009', 1))
  ) ->> 'number')::bigint,
  (select number from public.orders where idempotency_key = '51111111-1111-4111-8111-111111111111'),
  'a repeated submit returns the order it already created'
);
select ok(
  (public.create_order_request(
    pg_temp.order_json('51111111-1111-4111-8111-111111111111', '41111111-1111-4111-8111-111111111111', 2),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0), pg_temp.line('a0000000-0000-4000-8000-000000000009', 1))
  ) ->> 'replayed')::boolean,
  'and says it is a replay'
);
select is((select count(*)::int from public.orders), 1, 'a repeated submit stores no second order');
select is((select count(*)::int from public.outbox_events), 1, 'a repeated submit writes no second outbox row');

-- the reserved piece again, under another attempt: refused, nothing stored
select is(
  public.create_order_request(
    pg_temp.order_json('52222222-2222-4222-8222-222222222222', '42222222-2222-4222-8222-222222222222', 2),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0), pg_temp.line('a0000000-0000-4000-8000-000000000009', 1))
  ),
  jsonb_build_object('ok', false, 'reason', 'unavailable', 'product_ids', jsonb_build_array('a0000000-0000-4000-8000-000000000009')),
  'a piece already reserved refuses the request and names it'
);
select is(
  (select count(*)::int from public.orders where idempotency_key = '52222222-2222-4222-8222-222222222222'),
  0,
  'a refused request stores no order'
);
select is((select count(*)::int from public.order_items), 2, 'a refused request stores no line, not even its available one');
select is((select count(*)::int from public.outbox_events), 1, 'a refused request writes no outbox row');

-- an available piece with a sold one: refused as a whole, and the available piece is not left reserved
select is(
  public.create_order_request(
    pg_temp.order_json('53333333-3333-4333-8333-333333333333', null, 2),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000003', 0), pg_temp.line('a0000000-0000-4000-8000-000000000008', 1))
  ),
  jsonb_build_object('ok', false, 'reason', 'unavailable', 'product_ids', jsonb_build_array('a0000000-0000-4000-8000-000000000008')),
  'a sold piece refuses the request'
);
select is(
  (select availability::text from public.products where id = 'a0000000-0000-4000-8000-000000000003'),
  'available',
  'the refused request leaves no piece reserved'
);
select is(
  public.create_order_request(
    pg_temp.order_json('54444444-4444-4444-8444-444444444444', null, 3),
    jsonb_build_array(
      pg_temp.line('a0000000-0000-4000-8000-000000000005', 0),
      pg_temp.line('a0000000-0000-4000-8000-000000000011', 1),
      pg_temp.line('a0000000-0000-4000-8000-000000000014', 2)
    )
  ) -> 'product_ids',
  jsonb_build_array(
    'a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000014'
  ),
  'a reserved piece, a draft and a soft-deleted product are all refused'
);
select is(
  (select count(*)::int from public.orders where idempotency_key = '54444444-4444-4444-8444-444444444444'),
  0,
  'nothing is stored for them'
);

-- a guest's request, and one of customer B
select is(
  public.create_order_request(
    pg_temp.order_json('55555555-5555-4555-8555-555555555555', null, 1),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000003', 0))
  ) ->> 'ok',
  'true',
  'a guest places a request'
);
select is(
  (select user_id from public.orders where idempotency_key = '55555555-5555-4555-8555-555555555555'),
  null,
  'a guest''s order belongs to no account'
);
select is(
  public.create_order_request(
    pg_temp.order_json('56666666-6666-4666-8666-666666666666', '42222222-2222-4222-8222-222222222222', 1),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0))
  ) ->> 'ok',
  'true',
  'customer B places a request'
);

select throws_ok(
  $$select public.create_order_request(
    pg_temp.order_json('57777777-7777-4777-8777-777777777777', null, 2),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0)))$$,
  '22023',
  null,
  'totals that do not match the lines are refused'
);
select throws_ok(
  $$select public.create_order_request(pg_temp.order_json('57777777-7777-4777-8777-777777777777', null, 0), '[]'::jsonb)$$,
  '22023',
  null,
  'a request without lines is refused'
);
select throws_ok(
  $$select public.create_order_request(
    pg_temp.order_json('57777777-7777-4777-8777-777777777777', null, 1) || '{"country": "GB"}',
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0)))$$,
  '23514',
  null,
  'the UK is not a destination (D2)'
);
select throws_ok(
  $$select public.create_order_request(
    pg_temp.order_json('57777777-7777-4777-8777-777777777777', null, 1) || '{"country": "UA"}',
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0)))$$,
  '23514',
  null,
  'Ukraine is delivered by Nova Poshta only'
);
select throws_ok(
  $$insert into public.order_items (order_id, position, fulfillment, title, title_locale, quantity,
      unit_price_usd_minor, unit_price_minor, line_total_usd_minor, line_total_minor)
    select id, 9, 'one_of_a_kind', 'Piece', 'en', 2, 1000, 1030, 2000, 2060
    from public.orders where idempotency_key = '51111111-1111-4111-8111-111111111111'$$,
  '23514',
  null,
  'a one-of-a-kind piece is ordered once'
);

-- anon --------------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.orders$$, '42501', null, 'a guest cannot read orders through the API');
select throws_ok($$select * from public.order_items$$, '42501', null, 'a guest cannot read order lines through the API');
select throws_ok(
  $$select public.create_order_request(
    pg_temp.order_json('58888888-8888-4888-8888-888888888888', null, 1),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0)))$$,
  '42501',
  null,
  'a guest cannot place a request through the API'
);
reset role;

-- customer A -----------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"41111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select results_eq(
  $$select idempotency_key from public.orders$$,
  $$values ('51111111-1111-4111-8111-111111111111'::uuid)$$,
  'a customer reads only their own order, not a guest''s or another customer''s'
);
select is(
  (select count(*)::int from public.order_items),
  2,
  'a customer reads only the lines of their own order'
);
select throws_ok(
  $$insert into public.orders (idempotency_key, locale, first_name, phone, email, country, delivery_carrier,
      delivery_method, delivery_destination, delivery_estimate_state, currency, currency_decimals, fx_rate,
      markup_bps, items_total_usd_minor, items_total_minor)
    values (gen_random_uuid(), 'en', 'A', '+380501234567', 'a@example.test', 'DE', 'nova_post', 'division', '{}',
      'unavailable', 'EUR', 2, 1, 0, 0, 0)$$,
  '42501',
  null,
  'a customer cannot write an order through the API'
);
select throws_ok(
  $$update public.orders set status = 'closed'$$,
  '42501',
  null,
  'a customer cannot change an order'
);
select throws_ok(
  $$update public.order_items set unit_price_minor = 0$$,
  '42501',
  null,
  'a customer cannot change an order line'
);
select throws_ok($$delete from public.orders$$, '42501', null, 'a customer cannot delete an order');
select throws_ok($$select * from public.outbox_events$$, '42501', null, 'a customer cannot read the outbox');
select throws_ok(
  $$select public.create_order_request(
    pg_temp.order_json('59999999-9999-4999-8999-999999999999', '41111111-1111-4111-8111-111111111111', 1),
    jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0)))$$,
  '42501',
  null,
  'a customer cannot place a request past the server (no price of their own)'
);
reset role;

-- customer B sees only theirs
select set_config('request.jwt.claims', '{"sub":"42222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$select idempotency_key from public.orders$$,
  $$values ('56666666-6666-4666-8666-666666666666'::uuid)$$,
  'another customer reads only their own order'
);
reset role;

select * from finish();
rollback;
