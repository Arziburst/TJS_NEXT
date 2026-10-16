-- Webhook receipts (#99): the service role claims an id once; no API user may claim one or read the table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local role authenticated;
select throws_ok(
  $$select public.claim_webhook_receipt('send-email:x')$$,
  '42501', null, 'a customer cannot claim a webhook receipt'
);
select throws_ok(
  $$select * from private.webhook_receipts$$,
  '42501', null, 'a customer cannot read the webhook receipts'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.claim_webhook_receipt('send-email:x')$$,
  '42501', null, 'anon cannot claim a webhook receipt'
);
select throws_ok(
  $$insert into private.webhook_receipts (id) values ('send-email:forged')$$,
  '42501', null, 'anon cannot write a webhook receipt'
);
reset role;

set local role service_role;
select is(public.claim_webhook_receipt('send-email:test-1'), true, 'the first claim of an id is new');
select is(public.claim_webhook_receipt('send-email:test-1'), false, 'a second claim of the same id is a replay');
select throws_ok(
  $$select public.claim_webhook_receipt('')$$,
  '22023', null, 'an empty id is refused'
);
reset role;

select is(
  (select count(*)::integer from private.webhook_receipts where id = 'send-email:test-1'),
  1,
  'the id is stored once'
);

select * from finish();
rollback;
