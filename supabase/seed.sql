-- Local and CI seed data, loaded by `npm run db:reset` after the migrations ([db.seed] in config.toml).
-- Dev/QA data only: never production data, and never reference data the app needs (that goes in a migration).

-- Categories of D9 in the legacy order. English names are the decision's own words (human); every other
-- locale is a machine translation that the owner has not reviewed yet.
insert into public.categories (id, slug, position) values
  ('c0000000-0000-4000-8000-000000000001', 'earrings', 1),
  ('c0000000-0000-4000-8000-000000000002', 'necklaces', 2),
  ('c0000000-0000-4000-8000-000000000003', 'bracelets', 3),
  ('c0000000-0000-4000-8000-000000000004', 'corals', 4),
  ('c0000000-0000-4000-8000-000000000005', 'rings', 5),
  ('c0000000-0000-4000-8000-000000000006', 'brooches', 6);

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
join public.categories c on c.slug = t.slug;

-- Synthetic products (not the real catalog, D13 — SKUs, prices, lead times and texts are test values).
-- Made-to-order and one-of-a-kind pieces, the latter available, reserved and sold. Hidden from the public:
-- 11 (draft), 13 (archived), 14 (soft-deleted). No images: the files would have to be uploaded to Storage.
insert into public.products
  (id, category_id, sku, status, fulfillment, availability, lead_time_days, price_usd, weight_g, materials, care,
   created_at, deleted_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'TEST-001', 'published',
   'made_to_order', 'available', null, 24.90, 6, 'Brass, gold-tone plating, synthetic coral',
   'Keep dry; store separately', now() - interval '1 day', null),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'TEST-002', 'published',
   'made_to_order', 'available', null, 18.50, 4, 'Stainless steel, glass pearl',
   'Wipe with a soft cloth', now() - interval '3 days', null),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'TEST-003', 'published',
   'one_of_a_kind', 'available', null, 32.00, 9, 'Brass, gold-tone plating',
   'Avoid perfume and water', now() - interval '12 days', null),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'TEST-004', 'published',
   'made_to_order', 'available', null, 39.90, 18, 'Brass, gold-tone plating',
   'Keep dry; store flat', now() - interval '2 days', null),
  ('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'TEST-005', 'published',
   'one_of_a_kind', 'reserved', null, 45.00, 22, 'Zinc alloy, crystal',
   'Wipe with a soft cloth', now() - interval '20 days', null),
  ('a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000003', 'TEST-006', 'published',
   'made_to_order', 'available', null, 21.00, 10, 'Glass beads, elastic cord',
   'Do not overstretch', now() - interval '25 days', null),
  ('a0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000003', 'TEST-007', 'published',
   'made_to_order', 'available', 10, 27.50, 12, 'Stainless steel',
   'Wipe with a soft cloth', now() - interval '30 days', null),
  ('a0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000004', 'TEST-008', 'published',
   'one_of_a_kind', 'sold', null, 54.90, 30, 'Synthetic coral, silk thread',
   'Keep away from water and cosmetics', now() - interval '5 days', null),
  ('a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000004', 'TEST-009', 'published',
   'one_of_a_kind', 'available', null, 29.90, 8, 'Synthetic coral, elastic cord',
   'Keep away from water and cosmetics', now() - interval '40 days', null),
  ('a0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000005', 'TEST-010', 'published',
   'made_to_order', 'available', 14, 16.90, 3, 'Brass, silver-tone plating',
   'Remove before washing hands', now() - interval '45 days', null),
  ('a0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000005', 'TEST-011', 'draft',
   'made_to_order', 'available', null, 22.40, 4, 'Brass, glass stone',
   'Remove before washing hands', now() - interval '50 days', null),
  ('a0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000006', 'TEST-012', 'published',
   'made_to_order', 'available', null, 19.90, 7, 'Zinc alloy, enamel',
   'Store in a pouch', now() - interval '60 days', null),
  ('a0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000006', 'TEST-013', 'archived',
   'one_of_a_kind', 'sold', null, 26.00, 6, 'Brass, enamel',
   'Store in a pouch', now() - interval '90 days', null),
  ('a0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000003', 'TEST-014', 'published',
   'made_to_order', 'available', null, 23.00, 9, 'Stainless steel',
   'Wipe with a soft cloth', now() - interval '70 days', now() - interval '1 day');

-- en and uk for every product (entered by hand: human); a few machine translations in other locales,
-- one of them already reviewed.
insert into public.product_translations
  (product_id, locale, slug, title, description, alt_text, meta_title, meta_description, source, reviewed_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'en', 'coral-drop-earrings', 'Coral drop earrings',
   'Light drop earrings with a synthetic coral bead.', 'Coral drop earrings on a beige background',
   'Coral drop earrings', 'Light drop earrings with a synthetic coral bead.', 'human', null),
  ('a0000000-0000-4000-8000-000000000001', 'uk', 'serezhky-krapli-z-koralom', 'Сережки-краплі з коралом',
   'Легкі сережки-краплі з намистиною синтетичного коралу.', 'Сережки-краплі з коралом на бежевому тлі',
   'Сережки-краплі з коралом', 'Легкі сережки-краплі з намистиною синтетичного коралу.', 'human', null),
  ('a0000000-0000-4000-8000-000000000001', 'de', 'korallen-tropfenohrringe', 'Korallen-Tropfenohrringe',
   'Leichte Tropfenohrringe mit einer synthetischen Korallenperle.', null, null, null, 'machine', now() - interval '1 hour'),
  ('a0000000-0000-4000-8000-000000000001', 'pl', 'kolczyki-z-koralem', 'Kolczyki z koralem',
   'Lekkie kolczyki z koralikiem z syntetycznego korala.', null, null, null, 'machine', null),

  ('a0000000-0000-4000-8000-000000000002', 'en', 'pearl-stud-earrings', 'Pearl stud earrings',
   'Small studs with a glass pearl.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000002', 'uk', 'serezhky-hvozdyky-z-perlynoiu', 'Сережки-гвоздики з перлиною',
   'Маленькі гвоздики зі скляною перлиною.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000003', 'en', 'gold-tone-hoop-earrings', 'Gold-tone hoop earrings',
   'Classic hoops with a gold-tone finish.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000003', 'uk', 'serezhky-kiltsia-zolotysti', 'Сережки-кільця золотисті',
   'Класичні сережки-кільця із золотистим покриттям.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000004', 'en', 'layered-chain-necklace', 'Layered chain necklace',
   'Three fine chains worn together.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000004', 'uk', 'bahatosharove-namysto-lantsiuzhok', 'Багатошарове намисто-ланцюжок',
   'Три тонкі ланцюжки, що носяться разом.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000004', 'de', 'mehrreihige-gliederkette', 'Mehrreihige Gliederkette',
   'Drei feine Ketten, die zusammen getragen werden.', null, null, null, 'machine', null),
  ('a0000000-0000-4000-8000-000000000004', 'fr', 'collier-chaine-multirang', 'Collier chaîne multirang',
   'Trois chaînes fines portées ensemble.', null, null, null, 'machine', null),

  ('a0000000-0000-4000-8000-000000000005', 'en', 'crystal-pendant-necklace', 'Crystal pendant necklace',
   'A chain with a single crystal pendant.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000005', 'uk', 'namysto-z-kulonom-krystalom', 'Намисто з кулоном-кристалом',
   'Ланцюжок з одним кулоном-кристалом.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000006', 'en', 'beaded-bracelet', 'Beaded bracelet',
   'Glass beads on an elastic cord.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000006', 'uk', 'braslet-iz-namystyn', 'Браслет із намистин',
   'Скляні намистини на еластичному шнурі.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000007', 'en', 'charm-bracelet', 'Charm bracelet',
   'A steel chain with small charms.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000007', 'uk', 'braslet-z-pidviskamy', 'Браслет з підвісками',
   'Сталевий ланцюжок з маленькими підвісками.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000007', 'pl', 'bransoletka-z-zawieszkami', 'Bransoletka z zawieszkami',
   'Stalowy łańcuszek z małymi zawieszkami.', null, null, null, 'machine', null),

  ('a0000000-0000-4000-8000-000000000008', 'en', 'red-coral-necklace', 'Red coral necklace',
   'A strand of synthetic red coral beads.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000008', 'uk', 'namysto-z-chervonoho-koralu', 'Намисто з червоного коралу',
   'Нитка намистин із синтетичного червоного коралу.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000008', 'de', 'rote-korallenkette', 'Rote Korallenkette',
   'Ein Strang aus synthetischen roten Korallenperlen.', null, null, null, 'machine', null),
  ('a0000000-0000-4000-8000-000000000008', 'it', 'collana-di-corallo-rosso', 'Collana di corallo rosso',
   'Un filo di perle di corallo rosso sintetico.', null, null, null, 'machine', null),

  ('a0000000-0000-4000-8000-000000000009', 'en', 'coral-bead-bracelet', 'Coral bead bracelet',
   'Synthetic coral beads on an elastic cord.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000009', 'uk', 'braslet-z-koralovykh-namystyn', 'Браслет з коралових намистин',
   'Намистини із синтетичного коралу на еластичному шнурі.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000010', 'en', 'adjustable-stacking-ring', 'Adjustable stacking ring',
   'A thin open ring that fits most sizes.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000010', 'uk', 'rehulovana-kabluchka', 'Регульована каблучка',
   'Тонка відкрита каблучка, що підходить до більшості розмірів.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000011', 'en', 'cocktail-ring-with-stone', 'Cocktail ring with stone',
   'A bold ring with a large glass stone.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000011', 'uk', 'kokteilna-kabluchka-z-kamenem', 'Коктейльна каблучка з каменем',
   'Виразна каблучка з великим скляним каменем.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000012', 'en', 'enamel-flower-brooch', 'Enamel flower brooch',
   'A flower-shaped brooch with enamel petals.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000012', 'uk', 'emalevana-broshka-kvitka', 'Емалева брошка-квітка',
   'Брошка у формі квітки з емалевими пелюстками.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000013', 'en', 'enamel-bird-brooch', 'Enamel bird brooch',
   'A small bird with enamel wings.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000013', 'uk', 'emalevana-broshka-ptakh', 'Емалева брошка-пташка',
   'Маленька пташка з емалевими крилами.', null, null, null, 'human', null),

  ('a0000000-0000-4000-8000-000000000014', 'en', 'steel-cuff-bracelet', 'Steel cuff bracelet',
   'An open cuff in polished steel.', null, null, null, 'human', null),
  ('a0000000-0000-4000-8000-000000000014', 'uk', 'stalevyi-braslet-manzheta', 'Сталевий браслет-манжета',
   'Відкритий браслет-манжета з полірованої сталі.', null, null, null, 'human', null);
