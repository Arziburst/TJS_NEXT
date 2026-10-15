-- The About page: one row with its published state, texts per locale readable only once published, admin-only
-- writes through admin_save_about (uk required to publish), negative tests for anon and a customer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000021c2', 'customer-' || gen_random_uuid() || '@example.test'),
  ('00000000-0000-4000-8000-0000000021a2', 'admin-' || gen_random_uuid() || '@example.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000021a2';

-- Structure -----------------------------------------------------------------------------------------------
select has_table('public', 'about_page', 'about_page exists');
select has_table('public', 'about_translations', 'about_translations exists');
select ok((select relrowsecurity from pg_class where oid = 'public.about_page'::regclass), 'RLS on about_page');
select ok((select relrowsecurity from pg_class where oid = 'public.about_translations'::regclass), 'RLS on about_translations');
select is((select published from public.about_page), false, 'the page starts unpublished');
select is((select count(*)::int from public.about_translations), 0, 'the page starts without text (the owner writes it)');
select throws_ok($$insert into public.about_page (id) values (2)$$, '23514', null, 'a second page row is refused');
select throws_ok(
  $$insert into public.about_translations (locale, body_html) values ('ru', '<p>x</p>')$$,
  '23514', null, 'only the shop''s locales (D3)'
);

-- Admin: a draft, then publishing --------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000021a2", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_save_about(true, '[{"locale": "en", "body_html": "<p>Story</p>"}]'::jsonb)$$,
  '23514', null, 'publishing needs the Ukrainian text'
);
select lives_ok(
  $$select public.admin_save_about(false, '[{"locale": "en", "body_html": "<p>Draft</p>"}]'::jsonb)$$,
  'the admin saves a draft without uk'
);
select is((select count(*)::int from public.about_translations), 1, 'the admin reads the draft');
reset role;

-- An unpublished draft is invisible to everyone else ---------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is((select count(*)::int from public.about_translations), 0, 'anon does not see the draft');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000021a2", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.admin_save_about(true, '[{"locale": "uk", "body_html": "<p>Історія</p>", "meta_description": "Про нас"},
      {"locale": "en", "body_html": "<p>Story</p>"}]'::jsonb)$$,
  'the admin publishes with uk and en'
);
reset role;
select is(
  (select string_agg(locale || ':' || source || ':' || updated_by::text, ',' order by locale) from public.about_translations),
  'en:human:00000000-0000-4000-8000-0000000021a2,uk:human:00000000-0000-4000-8000-0000000021a2',
  'the texts are a person''s, attributed to the admin'
);

-- Anonymous visitor: reads the published texts, never writes ------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;
select is((select count(*)::int from public.about_translations), 2, 'anon reads the published texts');
select throws_ok($$select created_by from public.about_translations$$, '42501', null, 'anon cannot read who wrote them');
select throws_ok(
  $$insert into public.about_translations (locale, body_html) values ('de', '<p>x</p>')$$,
  '42501', null, 'anon cannot insert a text'
);
select throws_ok($$update public.about_page set published = false$$, '42501', null, 'anon cannot unpublish');
select throws_ok(
  $$select public.admin_save_about(false, '[]'::jsonb)$$,
  '42501', null, 'anon cannot call admin_save_about'
);
reset role;

-- Signed-in customer: reads, every write refused or reaching no row -------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000021c2", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.about_translations (locale, body_html) values ('de', '<p>x</p>')$$,
  '42501', null, 'a customer cannot insert a text'
);
select throws_ok(
  $$select public.admin_save_about(false, '[]'::jsonb)$$,
  '42501', null, 'a customer cannot call admin_save_about'
);
update public.about_translations set body_html = '<p>defaced</p>';
delete from public.about_translations;
update public.about_page set published = false;
reset role;
select is(
  (select body_html from public.about_translations where locale = 'en'),
  '<p>Story</p>',
  'the customer''s update and delete changed nothing'
);
select is((select published from public.about_page), true, 'the customer could not unpublish');

-- Admin: a locale left out loses its text ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000021a2", "role": "authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.admin_save_about(true, '[{"locale": "uk", "body_html": "<p>Історія</p>"}]'::jsonb)$$,
  'the admin saves uk only'
);
reset role;
select is((select array_agg(locale::text) from public.about_translations), array['uk']::text[], 'the en text was removed');

select * from finish();
rollback;
