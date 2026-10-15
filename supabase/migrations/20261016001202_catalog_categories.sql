-- Reference data: the six categories of D9 in the legacy order, named in the 11 locales of D3. English names
-- are the decision's own words (human); the other locales are machine translations the owner has not
-- reviewed yet. Idempotent: existing categories and names are left as they are.

insert into public.categories (slug, position) values
  ('earrings', 1),
  ('necklaces', 2),
  ('bracelets', 3),
  ('corals', 4),
  ('rings', 5),
  ('brooches', 6)
on conflict (slug) do nothing;

insert into public.category_translations (category_id, locale, name, source)
select c.id, t.locale, t.name, (case when t.locale = 'en' then 'human' else 'machine' end)::public.translation_source
from (values
  ('earrings', 'en', 'Earrings'), ('earrings', 'uk', 'Сережки'), ('earrings', 'de', 'Ohrringe'),
  ('earrings', 'fr', 'Boucles d''oreilles'), ('earrings', 'es', 'Pendientes'), ('earrings', 'it', 'Orecchini'),
  ('earrings', 'pl', 'Kolczyki'), ('earrings', 'nl', 'Oorbellen'), ('earrings', 'cs', 'Náušnice'),
  ('earrings', 'pt', 'Brincos'), ('earrings', 'ro', 'Cercei'),

  ('necklaces', 'en', 'Necklaces'), ('necklaces', 'uk', 'Намиста'), ('necklaces', 'de', 'Halsketten'),
  ('necklaces', 'fr', 'Colliers'), ('necklaces', 'es', 'Collares'), ('necklaces', 'it', 'Collane'),
  ('necklaces', 'pl', 'Naszyjniki'), ('necklaces', 'nl', 'Kettingen'), ('necklaces', 'cs', 'Náhrdelníky'),
  ('necklaces', 'pt', 'Colares'), ('necklaces', 'ro', 'Coliere'),

  ('bracelets', 'en', 'Bracelets'), ('bracelets', 'uk', 'Браслети'), ('bracelets', 'de', 'Armbänder'),
  ('bracelets', 'fr', 'Bracelets'), ('bracelets', 'es', 'Pulseras'), ('bracelets', 'it', 'Bracciali'),
  ('bracelets', 'pl', 'Bransoletki'), ('bracelets', 'nl', 'Armbanden'), ('bracelets', 'cs', 'Náramky'),
  ('bracelets', 'pt', 'Pulseiras'), ('bracelets', 'ro', 'Brățări'),

  ('corals', 'en', 'Corals'), ('corals', 'uk', 'Корали'), ('corals', 'de', 'Korallen'),
  ('corals', 'fr', 'Coraux'), ('corals', 'es', 'Corales'), ('corals', 'it', 'Coralli'),
  ('corals', 'pl', 'Korale'), ('corals', 'nl', 'Koralen'), ('corals', 'cs', 'Korály'),
  ('corals', 'pt', 'Corais'), ('corals', 'ro', 'Corali'),

  ('rings', 'en', 'Rings'), ('rings', 'uk', 'Каблучки'), ('rings', 'de', 'Ringe'),
  ('rings', 'fr', 'Bagues'), ('rings', 'es', 'Anillos'), ('rings', 'it', 'Anelli'),
  ('rings', 'pl', 'Pierścionki'), ('rings', 'nl', 'Ringen'), ('rings', 'cs', 'Prsteny'),
  ('rings', 'pt', 'Anéis'), ('rings', 'ro', 'Inele'),

  ('brooches', 'en', 'Brooches'), ('brooches', 'uk', 'Брошки'), ('brooches', 'de', 'Broschen'),
  ('brooches', 'fr', 'Broches'), ('brooches', 'es', 'Broches'), ('brooches', 'it', 'Spille'),
  ('brooches', 'pl', 'Broszki'), ('brooches', 'nl', 'Broches'), ('brooches', 'cs', 'Brože'),
  ('brooches', 'pt', 'Broches'), ('brooches', 'ro', 'Broșe')
) as t (slug, locale, name)
join public.categories c on c.slug = t.slug
on conflict (category_id, locale) do nothing;
