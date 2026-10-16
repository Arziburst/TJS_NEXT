-- The notifications outbox (#26): only the server claims and completes events; a claim leases the event (a second
-- claim does not get it), the outcome is written only with the claim's token, and an event is processed exactly
-- when no channel is pending. SKIP LOCKED between two sessions is covered by
-- tests/notifications/outbox.integration.test.ts (one pgTAP transaction cannot hold two sessions).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixture: one guest order request for the seed's made-to-order TEST-001 ($24.90; test values below).
select is(
  public.create_order_request(
    jsonb_build_object(
      'idempotency_key', '61111111-1111-4111-8111-111111111111', 'user_id', null, 'locale', 'de',
      'first_name', 'Outbox', 'last_name', null, 'phone', '+4915112345678', 'email', 'outbox@example.test',
      'comment', null, 'country', 'DE', 'delivery_carrier', 'nova_post', 'delivery_method', 'division',
      'delivery_destination', jsonb_build_object('divisionId', 1),
      'delivery_estimate_state', 'tbd', 'delivery_estimate_source', 'flat_rate',
      'delivery_estimate_minor', null, 'delivery_estimate_currency', null, 'delivery_estimate_decimals', null,
      'currency', 'EUR', 'currency_decimals', 2, 'fx_rate', '0.92', 'fx_rate_date', '2026-10-16', 'markup_bps', 300,
      'items_total_usd_minor', 1000, 'items_total_minor', 1030
    ),
    jsonb_build_array(jsonb_build_object(
      'product_id', 'a0000000-0000-4000-8000-000000000001', 'variant_id', null, 'position', 0, 'title', 'Piece',
      'title_locale', 'en', 'quantity', 1, 'unit_price_usd_minor', 1000, 'unit_price_minor', 1030
    ))
  ) ->> 'ok',
  'true',
  'an order request is placed'
);

create temp table fixture as
  select e.id as event_id, e.order_id
  from public.outbox_events e
  join public.orders o on o.id = e.order_id
  where o.idempotency_key = '61111111-1111-4111-8111-111111111111';
grant select on fixture to anon, authenticated;

select results_eq(
  $$select telegram_status::text, email_status::text, attempts, processed_at is null, claim_token is null
    from public.outbox_events where id = (select event_id from fixture)$$,
  $$values ('pending', 'pending', 0, true, true)$$,
  'a new event waits with both channels pending'
);

select enum_has_labels(
  'public', 'notification_delivery', array['pending', 'sent', 'skipped_unconfigured', 'skipped_expired', 'failed'],
  'a channel is pending, sent, skipped (not configured, or too late) or failed'
);

-- Access -----------------------------------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.claim_outbox_events(integer, integer)', 'execute'), 'the server may claim');
select ok(
  has_function_privilege('service_role', 'public.complete_outbox_event(uuid, uuid, public.notification_delivery, public.notification_delivery, text, integer)', 'execute'),
  'the server may complete'
);
select ok(not has_function_privilege('anon', 'public.claim_outbox_events(integer, integer)', 'execute'), 'a guest may not claim');
select ok(not has_function_privilege('authenticated', 'public.claim_outbox_events(integer, integer)', 'execute'), 'a signed-in user may not claim');
select ok(
  not has_function_privilege('authenticated', 'public.complete_outbox_event(uuid, uuid, public.notification_delivery, public.notification_delivery, text, integer)', 'execute'),
  'a signed-in user may not complete'
);

set local role anon;
select throws_ok($$select * from public.outbox_events$$, '42501', null, 'a guest cannot read the outbox');
select throws_ok($$select * from public.claim_outbox_events(10, 60)$$, '42501', null, 'a guest cannot claim through the API');
reset role;

select set_config('request.jwt.claims', '{"sub":"41111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select * from public.outbox_events$$, '42501', null, 'a customer cannot read the outbox');
select throws_ok(
  $$select public.complete_outbox_event((select event_id from fixture), gen_random_uuid(), 'sent', 'sent')$$,
  '42501',
  null,
  'a customer cannot mark an event sent'
);
reset role;

-- Claiming ---------------------------------------------------------------------------------------------------
create temp table first_claim as select * from public.claim_outbox_events(100, 300);

select is((select count(*)::int from first_claim where id = (select event_id from fixture)), 1, 'a due event is claimed');
select results_eq(
  $$select attempts, claim_token is not null, next_attempt_at = now() + interval '300 seconds'
    from public.outbox_events where id = (select event_id from fixture)$$,
  $$values (1, true, true)$$,
  'the claim counts an attempt, sets a token and leases the event'
);
select is(
  (select count(*)::int from public.claim_outbox_events(100, 300) where id = (select event_id from fixture)),
  0,
  'a leased event is not claimed again'
);
select throws_ok($$select * from public.claim_outbox_events(0, 300)$$, '22023', null, 'a claim takes at least one event');
select throws_ok($$select * from public.claim_outbox_events(10, 0)$$, '22023', null, 'a claim needs a lease');

-- Completing -------------------------------------------------------------------------------------------------
select is(
  public.complete_outbox_event((select event_id from fixture), gen_random_uuid(), 'sent', 'sent'),
  false,
  'another claim''s token writes nothing'
);
select is(
  public.complete_outbox_event(
    (select event_id from fixture), (select claim_token from first_claim where id = (select event_id from fixture)),
    'pending', 'sent', 'telegram: HTTP 502', 60
  ),
  true,
  'the claim writes a retry'
);
select results_eq(
  $$select telegram_status::text, email_status::text, last_error, processed_at is null, claim_token is null,
      next_attempt_at = now() + interval '60 seconds'
    from public.outbox_events where id = (select event_id from fixture)$$,
  $$values ('pending', 'sent', 'telegram: HTTP 502', true, true, true)$$,
  'a retry keeps the sent channel, records the error and is due after the backoff'
);
select is(
  public.complete_outbox_event(
    (select event_id from fixture), (select claim_token from first_claim where id = (select event_id from fixture)), 'sent', 'sent'
  ),
  false,
  'a completed claim cannot write again'
);
select is(
  (select count(*)::int from public.claim_outbox_events(100, 300) where id = (select event_id from fixture)),
  0,
  'a retry is not claimed before it is due'
);

-- the backoff has passed
update public.outbox_events set next_attempt_at = now() - interval '1 second' where id = (select event_id from fixture);
create temp table second_claim as select * from public.claim_outbox_events(100, 300);
select is(
  (select attempts from second_claim where id = (select event_id from fixture)),
  2,
  'a due retry is claimed again and counts its attempt'
);
select throws_ok(
  format(
    $$select public.complete_outbox_event(%L, %L, 'pending', 'sent')$$,
    (select event_id from fixture), (select claim_token from second_claim where id = (select event_id from fixture))
  ),
  '23514',
  null,
  'an event with a pending channel cannot be processed'
);
select is(
  public.complete_outbox_event(
    (select event_id from fixture), (select claim_token from second_claim where id = (select event_id from fixture)),
    'sent', 'skipped_unconfigured', 'email: not configured (RESEND_API_KEY unset)'
  ),
  true,
  'the claim marks the event processed'
);
select results_eq(
  $$select telegram_status::text, email_status::text, processed_at is not null, claim_token is null
    from public.outbox_events where id = (select event_id from fixture)$$,
  $$values ('sent', 'skipped_unconfigured', true, true)$$,
  'a processed event keeps each channel''s outcome for the admin'
);
update public.outbox_events set next_attempt_at = now() - interval '1 second' where id = (select event_id from fixture);
select is(
  (select count(*)::int from public.claim_outbox_events(100, 300) where id = (select event_id from fixture)),
  0,
  'a processed event is never claimed again'
);

-- the order is only read: a message's outcome never changes it
select results_eq(
  $$select status::text from public.orders where id = (select order_id from fixture)$$,
  $$values ('new')$$,
  'the order keeps its status'
);

select * from finish();
rollback;
