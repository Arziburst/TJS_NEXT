-- Shop settings: one row, public read of the public columns only, the Telegram chat id hidden from the Data API
-- roles, admin-only writes (negative tests included); the admin's price settings function.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Fixtures: a customer and an admin (the role is granted here, as the database owner; D12)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000021c1', 'customer-' || gen_random_uuid() || '@example.test'),
  ('00000000-0000-4000-8000-0000000021a1', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000021a1';
update public.shop_settings set telegram_chat_id = '-1001234567890', instagram_handle = 'tjs_test';

-- Structure -----------------------------------------------------------------------------------------------
select has_table('public', 'shop_settings', 'shop_settings exists');
select ok((select relrowsecurity from pg_class where oid = 'public.shop_settings'::regclass), 'RLS on shop_settings');
select is((select count(*)::int from public.shop_settings), 1, 'the settings are one row');
select throws_ok(
  $$insert into public.shop_settings (id) values (2)$$,
  '23514', null, 'a second settings row is refused'
);

-- Constraints: what the server normalizes to -------------------------------------------------------------------
select throws_ok($$update public.shop_settings set instagram_handle = 'has space'$$, '23514', null, 'an Instagram handle has no spaces');
select throws_ok($$update public.shop_settings set email = 'not-an-email'$$, '23514', null, 'an email needs @ and a domain');
select throws_ok($$update public.shop_settings set phone = 'call me'$$, '23514', null, 'a phone is digits');
select throws_ok(
  $$update public.shop_settings set telegram_url = 'https://evil.example/tjs'$$,
  '23514', null, 'a Telegram link goes to t.me'
);
select throws_ok(
  $$update public.shop_settings set whatsapp_url = 'javascript:alert(1)'$$,
  '23514', null, 'a WhatsApp link goes to wa.me'
);
select throws_ok(
  $$update public.shop_settings set viber_url = 'https://viber.example/chat'$$,
  '23514', null, 'a Viber link is a viber:// chat or an invite link'
);
select throws_ok($$update public.shop_settings set telegram_chat_id = '@group'$$, '23514', null, 'a chat id is a number');
select throws_ok($$update public.shop_settings set shop_name = '  '$$, '23514', null, 'a shop name is not blank');
select lives_ok(
  $$update public.shop_settings set
      telegram_url = 'https://t.me/tjs_shop', viber_url = 'viber://chat?number=%2B380661234567',
      whatsapp_url = 'https://wa.me/380661234567', phone = '+38 (066) 123 45 67', email = 'shop@example.test'$$,
  'the normalized links are accepted'
);

-- Anonymous visitor: reads the public columns, never the chat id, never writes ---------------------------------
set local role anon;
select is((select instagram_handle from public.shop_settings), 'tjs_test', 'anon reads the public columns');
select throws_ok($$select telegram_chat_id from public.shop_settings$$, '42501', null, 'anon cannot read the chat id');
select throws_ok($$select * from public.shop_settings$$, '42501', null, 'anon cannot read the whole row');
select throws_ok($$update public.shop_settings set instagram_handle = 'anon_was_here'$$, '42501', null, 'anon cannot update');
select throws_ok($$insert into public.shop_settings (id) values (1)$$, '42501', null, 'anon cannot insert');
select throws_ok($$delete from public.shop_settings$$, '42501', null, 'anon cannot delete');
select throws_ok(
  $$select public.admin_save_price_settings(0, '[]'::jsonb)$$,
  '42501', null, 'anon cannot call the price settings function'
);
reset role;

-- Signed-in customer: the same, the update reaches no row ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000021c1", "role": "authenticated"}', true);
set local role authenticated;
select is((select instagram_handle from public.shop_settings), 'tjs_test', 'a customer reads the public columns');
select throws_ok($$select telegram_chat_id from public.shop_settings$$, '42501', null, 'a customer cannot read the chat id');
update public.shop_settings set instagram_handle = 'customer_was_here', telegram_chat_id = '1';
select throws_ok($$delete from public.shop_settings$$, '42501', null, 'a customer cannot delete');
select throws_ok(
  $$select public.admin_save_price_settings(0, '[]'::jsonb)$$,
  '42501', null, 'a customer cannot change the price settings'
);
reset role;
select is(
  (select instagram_handle || ' ' || telegram_chat_id from public.shop_settings),
  'tjs_test -1001234567890',
  'the customer''s update changed nothing'
);
select is((select count(*)::int from public.currency_settings where markup_bps = 300), 7, 'the markup is untouched');

-- Admin: writes every column, still reads only the public ones through the Data API ---------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000021a1", "role": "authenticated"}', true);
set local role authenticated;
update public.shop_settings set instagram_handle = 'tjs_admin', telegram_chat_id = '-100999', shop_name = 'TJS';
select is((select instagram_handle from public.shop_settings), 'tjs_admin', 'the admin updates the public columns');
select throws_ok(
  $$select telegram_chat_id from public.shop_settings$$,
  '42501', null, 'the chat id stays out of the Data API even for the admin (the server reads it as service role)'
);
select throws_ok($$delete from public.shop_settings$$, '42501', null, 'not even the admin deletes the row');
select lives_ok(
  $$select public.admin_save_price_settings(450, '[{"currency": "UAH", "round_increment": 500, "ending": 0,
      "small_price_below": null, "small_round_increment": null, "small_ending": null}]'::jsonb)$$,
  'the admin saves the price settings'
);
select throws_ok(
  $$select public.admin_save_price_settings(300, '[{"currency": "UAH", "round_increment": 100, "ending": 100,
      "small_price_below": null, "small_round_increment": null, "small_ending": null}]'::jsonb)$$,
  '23514', null, 'an ending not below its step is refused'
);
select throws_ok(
  $$select public.admin_save_price_settings(300, '[{"currency": "GBP", "round_increment": 100, "ending": 0}]'::jsonb)$$,
  'P0002', null, 'an unknown currency is refused'
);
reset role;
select is(
  (select telegram_chat_id || ' ' || updated_by::text from public.shop_settings),
  '-100999 00000000-0000-4000-8000-0000000021a1',
  'the admin wrote the chat id, attributed to the admin'
);
select is((select count(*)::int from public.currency_settings where markup_bps = 450), 7, 'one markup for every currency (D28)');
select is(
  (select round_increment || '/' || ending from public.currency_settings where currency = 'UAH'),
  '500/0',
  'the UAH rounding rule is saved'
);

-- Service role (the server after its own admin check) reads the chat id ---------------------------------------------
set local role service_role;
select is((select telegram_chat_id from public.shop_settings), '-100999', 'the service role reads the chat id');
reset role;

select * from finish();
rollback;
