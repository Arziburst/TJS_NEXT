-- Reference data: the six D9 categories, named in all 11 locales of D3 (migration 20261016001202).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select results_eq(
  $$select slug from public.categories where slug in ('earrings', 'necklaces', 'bracelets', 'corals', 'rings', 'brooches') order by position$$,
  $$values ('earrings'), ('necklaces'), ('bracelets'), ('corals'), ('rings'), ('brooches')$$,
  'the six categories exist in the legacy order'
);

select is_empty(
  $$select c.slug, l.locale
    from public.categories c
    cross join unnest(array['uk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'cs', 'pt', 'ro']) as l (locale)
    where c.slug in ('earrings', 'necklaces', 'bracelets', 'corals', 'rings', 'brooches')
      and not exists (select 1 from public.category_translations t where t.category_id = c.id and t.locale = l.locale)$$,
  'every category is named in every locale'
);

select is(
  (select array_agg(distinct t.source::text) from public.category_translations t
   join public.categories c on c.id = t.category_id where t.locale = 'en'),
  array['human'],
  'English names are human'
);

select is(
  (select array_agg(distinct t.source::text) from public.category_translations t
   join public.categories c on c.id = t.category_id where t.locale <> 'en'),
  array['machine'],
  'the other locales are marked as machine translations'
);

select * from finish();
rollback;
