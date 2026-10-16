-- The admin's orders (#27): admins read every order, line, note and history row; customers and guests read none
-- of the notes or history and still only their own orders; only admin_set_order_status changes a status, along
-- the D17 transitions, selling or releasing one-of-a-kind pieces (D24) and writing a history row and an outbox
-- event in the same transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- Fixtures: an admin, two customers. Seed products: TEST-001 published made to order, TEST-003 and TEST-009
-- published one of a kind (available).
insert into auth.users (id, email) values
  ('60000000-0000-4000-8000-000000000001', 'admin-orders-' || gen_random_uuid() || '@example.test'),
  ('61111111-1111-4111-8111-111111111111', 'admin-orders-a-' || gen_random_uuid() || '@example.test'),
  ('62222222-2222-4222-8222-222222222222', 'admin-orders-b-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin', name = 'Owner' where id = '60000000-0000-4000-8000-000000000001';

create function pg_temp.order_json(p_key uuid, p_user uuid, p_lines integer, p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object(
    'idempotency_key', p_key, 'user_id', p_user, 'locale', 'uk',
    'first_name', 'Olena', 'last_name', 'Koval', 'phone', '+380501234567', 'email', 'olena@example.test',
    'comment', null, 'country', 'UA', 'delivery_carrier', 'nova_poshta', 'delivery_method', 'warehouse',
    'delivery_destination', jsonb_build_object('city', 'Kyiv'),
    'delivery_estimate_state', 'tbd', 'delivery_estimate_source', 'flat_rate',
    'delivery_estimate_minor', null, 'delivery_estimate_currency', null, 'delivery_estimate_decimals', null,
    'currency', 'UAH', 'currency_decimals', 0, 'fx_rate', '41.5', 'fx_rate_date', '2026-10-16', 'markup_bps', 300,
    'items_total_usd_minor', 1000 * p_lines, 'items_total_minor', 430 * p_lines
  ) || p_extra;
$$;

create function pg_temp.line(p_product uuid, p_position integer) returns jsonb
language sql as $$
  select jsonb_build_object(
    'product_id', p_product, 'variant_id', null, 'position', p_position, 'title', 'Piece ' || p_position,
    'title_locale', 'uk', 'quantity', 1, 'unit_price_usd_minor', 1000, 'unit_price_minor', 430
  );
$$;

create function pg_temp.number_of(p_key uuid) returns bigint
language sql as $$ select number from public.orders where idempotency_key = p_key $$;

create function pg_temp.availability(p_product uuid) returns text
language sql as $$ select availability::text from public.products where id = p_product $$;

create function pg_temp.as_user(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- O1: customer A, a made-to-order line and TEST-009; O2: a guest in Germany, TEST-003; O3: customer B, made to order
select public.create_order_request(
  pg_temp.order_json('71111111-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111', 2),
  jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0), pg_temp.line('a0000000-0000-4000-8000-000000000009', 1))
);
select public.create_order_request(
  pg_temp.order_json('72222222-2222-4222-8222-222222222222', null, 1, jsonb_build_object(
    'first_name', 'Anna', 'last_name', 'Schmidt', 'phone', '+4915112345678', 'email', 'anna@example.test',
    'country', 'DE', 'delivery_carrier', 'nova_post', 'delivery_method', 'division')),
  jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000003', 0))
);
select public.create_order_request(
  pg_temp.order_json('73333333-3333-4333-8333-333333333333', '62222222-2222-4222-8222-222222222222', 1, jsonb_build_object(
    'first_name', 'Bohdan', 'last_name', null, 'phone', '+380671112233', 'email', 'bohdan@example.test')),
  jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000001', 0))
);
-- O3 was placed three days ago (Kyiv dates), for the date filter; the timestamps trigger keeps created_at
alter table public.orders disable trigger orders_timestamps;
update public.orders set created_at = now() - interval '3 days'
where idempotency_key = '73333333-3333-4333-8333-333333333333';
alter table public.orders enable trigger orders_timestamps;

select is((select relrowsecurity from pg_class where oid = 'public.order_notes'::regclass), true, 'RLS is enabled on order_notes');
select is((select relrowsecurity from pg_class where oid = 'public.order_status_history'::regclass), true, 'RLS is enabled on order_status_history');
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000009'), 'reserved', 'O1 reserved its piece');
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000003'), 'reserved', 'O2 reserved its piece');

-- The admin reads ----------------------------------------------------------------------------------------------
select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
set local role authenticated;

select is((select count(*)::int from public.orders), 3, 'an admin reads every order, a guest''s and every customer''s');
select is((select count(*)::int from public.order_items), 4, 'an admin reads every order line');
select is(
  (public.admin_list_orders() - 'items'),
  jsonb_build_object('total', 3, 'new_count', 3),
  'the list counts every order and the new requests'
);
select is(
  (select jsonb_agg(item ->> 'number') from jsonb_array_elements(public.admin_list_orders() -> 'items') item),
  jsonb_build_array(
    pg_temp.number_of('72222222-2222-4222-8222-222222222222')::text,
    pg_temp.number_of('71111111-1111-4111-8111-111111111111')::text,
    pg_temp.number_of('73333333-3333-4333-8333-333333333333')::text
  ),
  'new requests come newest on top'
);
select is(
  (public.admin_list_orders(p_query => 'BOHDAN@example') -> 'total')::int, 1, 'the search finds an email, any case'
);
select is(
  (public.admin_list_orders(p_query => '+49 151 123') -> 'items' -> 0 ->> 'first_name'), 'Anna', 'the search finds a phone typed with spaces'
);
select is(
  (public.admin_list_orders(p_query => 'olena koval') -> 'total')::int, 1, 'the search finds a full name'
);
select is(
  (public.admin_list_orders(p_query => '#' || pg_temp.number_of('73333333-3333-4333-8333-333333333333')) -> 'items' -> 0 ->> 'first_name'),
  'Bohdan',
  'the search finds an order number with its #'
);
select is(
  (public.admin_list_orders(p_query => '%') -> 'total')::int, 0, 'a LIKE wildcard in the search is plain text'
);
select is((public.admin_list_orders(p_country => 'DE') -> 'total')::int, 1, 'the country filter');
select is(
  (public.admin_list_orders(p_date_from => (now() at time zone 'Europe/Kyiv')::date) -> 'total')::int,
  2,
  'the date filter starts at the Kyiv midnight of its first day'
);
select is(
  (public.admin_list_orders(p_date_to => (now() at time zone 'Europe/Kyiv')::date - 1) -> 'total')::int,
  1,
  'the date filter includes its last day'
);
select is(
  jsonb_array_length(public.admin_list_orders(p_limit => 2, p_offset => 2) -> 'items'), 1, 'the list is paged'
);
select throws_ok($$select public.admin_list_orders(p_limit => 101)$$, '22023', null, 'a page has at most 100 orders');

-- Status changes ---------------------------------------------------------------------------------------------

select is(
  public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'new', 'accepted'),
  jsonb_build_object('ok', false, 'reason', 'illegal'),
  'new → accepted skips a step: refused'
);
select is(
  public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'new', 'paid'),
  jsonb_build_object('ok', false, 'reason', 'illegal'),
  'a payment state is not reachable while payments are off'
);
select is(
  public.admin_set_order_status(999999999, 'new', 'in_processing'),
  jsonb_build_object('ok', false, 'reason', 'not_found'),
  'an unknown order'
);
select is(
  public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'new', 'in_processing'),
  jsonb_build_object('ok', true, 'status', 'in_processing', 'product_ids', '[]'::jsonb),
  'new → in processing'
);
select is(
  public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'new', 'in_processing'),
  jsonb_build_object('ok', false, 'reason', 'stale', 'status', 'in_processing'),
  'the same change again (a double tap, another tab) is stale'
);
select is(
  pg_temp.availability('a0000000-0000-4000-8000-000000000003'), 'reserved', 'in processing leaves the piece reserved'
);
select is(
  public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'in_processing', 'accepted'),
  jsonb_build_object('ok', true, 'status', 'accepted', 'product_ids', jsonb_build_array('a0000000-0000-4000-8000-000000000003')),
  'in processing → accepted names the piece it sold'
);
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000003'), 'sold', 'accepting sells the one-of-a-kind piece (D24)');
select is(
  (public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'accepted', 'closed') ->> 'ok')::boolean,
  true,
  'accepted → closed'
);
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000003'), 'sold', 'closing keeps the piece sold');
select is(
  public.admin_set_order_status(pg_temp.number_of('72222222-2222-4222-8222-222222222222'), 'closed', 'canceled'),
  jsonb_build_object('ok', false, 'reason', 'illegal'),
  'a closed order cannot be canceled'
);
select results_eq(
  $$select h.from_status::text, h.to_status::text, h.changed_by from public.order_status_history h
    join public.orders o on o.id = h.order_id where o.idempotency_key = '72222222-2222-4222-8222-222222222222'
    order by h.from_status$$,
  $$values ('new', 'in_processing', '60000000-0000-4000-8000-000000000001'::uuid),
           ('in_processing', 'accepted', '60000000-0000-4000-8000-000000000001'::uuid),
           ('accepted', 'closed', '60000000-0000-4000-8000-000000000001'::uuid)$$,
  'each change writes a history row with the admin who made it, and the refused ones none'
);
select is(
  (select status::text from public.orders where idempotency_key = '72222222-2222-4222-8222-222222222222'),
  'closed',
  'the order has its last status'
);

-- O1: new → canceled releases its reserved piece
select is(
  public.admin_set_order_status(pg_temp.number_of('71111111-1111-4111-8111-111111111111'), 'new', 'canceled'),
  jsonb_build_object('ok', true, 'status', 'canceled', 'product_ids', jsonb_build_array('a0000000-0000-4000-8000-000000000009')),
  'new → canceled names the piece it released'
);
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000009'), 'available', 'canceling releases the reserved piece (D24)');
select is(
  public.admin_set_order_status(pg_temp.number_of('71111111-1111-4111-8111-111111111111'), 'canceled', 'in_processing'),
  jsonb_build_object('ok', false, 'reason', 'illegal'),
  'a canceled order stays canceled'
);
reset role;

-- O4 (a guest) takes the released piece; accepted, then canceled, the piece is on sale again
select public.create_order_request(
  pg_temp.order_json('74444444-4444-4444-8444-444444444444', null, 1),
  jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000009', 0))
);
select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
set local role authenticated;
select public.admin_set_order_status(pg_temp.number_of('74444444-4444-4444-8444-444444444444'), 'new', 'in_processing');
select public.admin_set_order_status(pg_temp.number_of('74444444-4444-4444-8444-444444444444'), 'in_processing', 'accepted');
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000009'), 'sold', 'O4 sold the piece');
reset role;

-- O5 holds the same piece (written by hand: a request could not get it); accepting it would sell it twice
insert into public.orders (idempotency_key, locale, first_name, phone, email, country, delivery_carrier, delivery_method,
  delivery_destination, delivery_estimate_state, delivery_estimate_source, currency, currency_decimals, fx_rate, markup_bps,
  items_total_usd_minor, items_total_minor, status)
values ('75555555-5555-4555-8555-555555555555', 'uk', 'Iryna', '+380501112233', 'iryna@example.test', 'UA', 'nova_poshta',
  'warehouse', '{}', 'tbd', 'flat_rate', 'UAH', 0, 41.5, 300, 1000, 430, 'in_processing');
insert into public.order_items (order_id, position, product_id, fulfillment, title, title_locale, quantity,
  unit_price_usd_minor, unit_price_minor, line_total_usd_minor, line_total_minor)
select id, 0, 'a0000000-0000-4000-8000-000000000009', 'one_of_a_kind', 'Piece', 'uk', 1, 1000, 430, 1000, 430
from public.orders where idempotency_key = '75555555-5555-4555-8555-555555555555';

select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  public.admin_set_order_status(pg_temp.number_of('75555555-5555-4555-8555-555555555555'), 'in_processing', 'accepted'),
  jsonb_build_object('ok', false, 'reason', 'conflict', 'product_ids', jsonb_build_array('a0000000-0000-4000-8000-000000000009')),
  'accepting a piece sold with another order is refused and names it'
);
select is(
  (select status::text from public.orders where idempotency_key = '75555555-5555-4555-8555-555555555555'),
  'in_processing',
  'the refused change leaves the order as it was'
);
select is(
  (select count(*)::int from public.order_status_history h join public.orders o on o.id = h.order_id
   where o.idempotency_key = '75555555-5555-4555-8555-555555555555'),
  0,
  'and writes no history row'
);
-- O4 accepted → canceled: the piece would go back on sale, but O5 still holds it
select is(
  public.admin_set_order_status(pg_temp.number_of('74444444-4444-4444-8444-444444444444'), 'accepted', 'canceled'),
  jsonb_build_object('ok', true, 'status', 'canceled', 'product_ids', '[]'::jsonb),
  'canceling an accepted order keeps a piece another open order holds'
);
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000009'), 'sold', 'that piece stays as it is');
-- O5 canceled too: it never sold the piece (O4 did), so the sold piece stays sold
select is(
  public.admin_set_order_status(pg_temp.number_of('75555555-5555-4555-8555-555555555555'), 'in_processing', 'canceled'),
  jsonb_build_object('ok', true, 'status', 'canceled', 'product_ids', '[]'::jsonb),
  'canceling an order that never sold its piece does not put a sold piece back on sale'
);
reset role;

-- the accepted → canceled release itself: O6 takes TEST-009 again once it is on sale
update public.products set availability = 'available' where id = 'a0000000-0000-4000-8000-000000000009';
select public.create_order_request(
  pg_temp.order_json('76666666-6666-4666-8666-666666666666', null, 1),
  jsonb_build_array(pg_temp.line('a0000000-0000-4000-8000-000000000009', 0))
);
select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
set local role authenticated;
select public.admin_set_order_status(pg_temp.number_of('76666666-6666-4666-8666-666666666666'), 'new', 'in_processing');
select public.admin_set_order_status(pg_temp.number_of('76666666-6666-4666-8666-666666666666'), 'in_processing', 'accepted');
select is(
  public.admin_set_order_status(pg_temp.number_of('76666666-6666-4666-8666-666666666666'), 'accepted', 'canceled'),
  jsonb_build_object('ok', true, 'status', 'canceled', 'product_ids', jsonb_build_array('a0000000-0000-4000-8000-000000000009')),
  'canceling an accepted order names the piece it put back on sale'
);
select is(pg_temp.availability('a0000000-0000-4000-8000-000000000009'), 'available', 'the sold piece is on sale again');

-- Notes -----------------------------------------------------------------------------------------------------

select lives_ok(
  $$insert into public.order_notes (order_id, body)
    select id, 'Paid by card transfer' from public.orders where idempotency_key = '71111111-1111-4111-8111-111111111111'$$,
  'an admin writes a note; it is theirs by default'
);
select is(
  (select author_id from public.order_notes limit 1),
  '60000000-0000-4000-8000-000000000001'::uuid,
  'the note carries its author'
);
select throws_ok(
  $$insert into public.order_notes (order_id, author_id, body)
    select id, '61111111-1111-4111-8111-111111111111', 'Forged' from public.orders
    where idempotency_key = '71111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'an admin cannot write a note in someone else''s name'
);
select throws_ok(
  $$insert into public.order_notes (order_id, body, created_at)
    select id, 'Backdated', now() - interval '1 year' from public.orders
    where idempotency_key = '71111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'a note''s time is the server''s'
);
select throws_ok($$update public.order_notes set body = 'Changed'$$, '42501', null, 'a note is kept as written');
select throws_ok($$delete from public.order_notes$$, '42501', null, 'a note cannot be deleted through the API');
select throws_ok(
  $$insert into public.order_status_history (order_id, from_status, to_status)
    select id, 'new', 'closed' from public.orders limit 1$$,
  '42501',
  null,
  'nobody writes the history but the status change'
);
select throws_ok($$update public.orders set status = 'closed'$$, '42501', null, 'an admin changes a status only through the function');
reset role;

-- The outbox ------------------------------------------------------------------------------------------------

select is(
  (select e.payload from public.outbox_events e join public.orders o on o.id = e.order_id
   where o.idempotency_key = '72222222-2222-4222-8222-222222222222' and e.event = 'order_status_changed'
     and e.payload ->> 'from' = 'new') - 'number',
  jsonb_build_object('from', 'new', 'to', 'in_processing'),
  'a change writes an order_status_changed event with both statuses'
);
select is(
  (select count(*)::int from public.outbox_events e join public.orders o on o.id = e.order_id
   where o.idempotency_key = '72222222-2222-4222-8222-222222222222' and e.event = 'order_status_changed'
     and e.payload ->> 'number' = o.number::text and e.processed_at is null),
  3,
  'one event per change, with the order number, waiting for the sender'
);
select is(
  (select count(*)::int from public.outbox_events e join public.orders o on o.id = e.order_id
   where o.idempotency_key = '75555555-5555-4555-8555-555555555555' and e.event = 'order_status_changed'
     and e.payload ->> 'to' = 'accepted'),
  0,
  'a refused change writes no event'
);

-- A customer -------------------------------------------------------------------------------------------------
select pg_temp.as_user('61111111-1111-4111-8111-111111111111');
set local role authenticated;

select results_eq(
  $$select idempotency_key from public.orders$$,
  $$values ('71111111-1111-4111-8111-111111111111'::uuid)$$,
  'a customer still reads only their own order'
);
select is((select count(*)::int from public.order_notes), 0, 'a customer reads no note, not even on their own order');
select is((select count(*)::int from public.order_status_history), 0, 'a customer reads no status history');
select throws_ok(
  $$insert into public.order_notes (order_id, body)
    select id, 'Mine' from public.orders where idempotency_key = '71111111-1111-4111-8111-111111111111'$$,
  '42501',
  null,
  'a customer cannot write a note'
);
select throws_ok(
  $$select public.admin_set_order_status(pg_temp.number_of('73333333-3333-4333-8333-333333333333'), 'new', 'canceled')$$,
  '42501',
  null,
  'a customer cannot change a status'
);
select throws_ok($$select public.admin_list_orders()$$, '42501', null, 'a customer cannot list the orders');
reset role;

-- A guest ----------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from public.order_notes$$, '42501', null, 'a guest cannot read notes');
select throws_ok($$select * from public.order_status_history$$, '42501', null, 'a guest cannot read the history');
select throws_ok(
  $$select public.admin_set_order_status(10001, 'new', 'canceled')$$, '42501', null, 'a guest cannot change a status'
);
select throws_ok($$select public.admin_list_orders()$$, '42501', null, 'a guest cannot list the orders');
reset role;

-- A revoked admin ---------------------------------------------------------------------------------------------
update public.profiles set role = 'customer' where id = '60000000-0000-4000-8000-000000000001';
select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.orders), 0, 'a revoked admin reads no order');
select is((select count(*)::int from public.order_notes), 0, 'a revoked admin reads no note');
select throws_ok(
  $$select public.admin_set_order_status(pg_temp.number_of('73333333-3333-4333-8333-333333333333'), 'new', 'canceled')$$,
  '42501',
  null,
  'a revoked admin cannot change a status'
);
reset role;

select * from finish();
rollback;
