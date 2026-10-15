-- Local and CI seed data, loaded by `npm run db:reset` after the migrations ([db.seed] in config.toml).
-- Dev/QA data only: never production data, and never reference data the app needs (that goes in a migration;
-- the six categories come from 20261016001202_catalog_categories.sql).

-- Synthetic products (not the real catalog, D13 — SKUs, prices, lead times and texts are test values).
-- Made-to-order and one-of-a-kind pieces, the latter available, reserved and sold. Hidden from the public:
-- 11 (draft), 13 (archived), 14 (soft-deleted). No images: the files would have to be uploaded to Storage.
insert into public.products
  (id, category_id, sku, status, fulfillment, availability, lead_time_days, price_usd, weight_g, created_at, deleted_at)
select p.id::uuid, c.id, p.sku, p.status::public.product_status, p.fulfillment::public.product_fulfillment,
  p.availability::public.product_availability, p.lead_time_days, p.price_usd, p.weight_g,
  now() - p.age, now() - p.deleted_ago
from (values
  ('a0000000-0000-4000-8000-000000000001', 'earrings', 'TEST-001', 'published', 'made_to_order', 'available', null::int, 24.90, 6, interval '1 day', null::interval),
  ('a0000000-0000-4000-8000-000000000002', 'earrings', 'TEST-002', 'published', 'made_to_order', 'available', null, 18.50, 4, interval '3 days', null),
  ('a0000000-0000-4000-8000-000000000003', 'earrings', 'TEST-003', 'published', 'one_of_a_kind', 'available', null, 32.00, 9, interval '12 days', null),
  ('a0000000-0000-4000-8000-000000000004', 'necklaces', 'TEST-004', 'published', 'made_to_order', 'available', null, 39.90, 18, interval '2 days', null),
  ('a0000000-0000-4000-8000-000000000005', 'necklaces', 'TEST-005', 'published', 'one_of_a_kind', 'reserved', null, 45.00, 22, interval '20 days', null),
  ('a0000000-0000-4000-8000-000000000006', 'bracelets', 'TEST-006', 'published', 'made_to_order', 'available', null, 21.00, 10, interval '25 days', null),
  ('a0000000-0000-4000-8000-000000000007', 'bracelets', 'TEST-007', 'published', 'made_to_order', 'available', 10, 27.50, 12, interval '30 days', null),
  ('a0000000-0000-4000-8000-000000000008', 'corals', 'TEST-008', 'published', 'one_of_a_kind', 'sold', null, 54.90, 30, interval '5 days', null),
  ('a0000000-0000-4000-8000-000000000009', 'corals', 'TEST-009', 'published', 'one_of_a_kind', 'available', null, 29.90, 8, interval '40 days', null),
  ('a0000000-0000-4000-8000-000000000010', 'rings', 'TEST-010', 'published', 'made_to_order', 'available', 14, 16.90, 3, interval '45 days', null),
  ('a0000000-0000-4000-8000-000000000011', 'rings', 'TEST-011', 'draft', 'made_to_order', 'available', null, 22.40, 4, interval '50 days', null),
  ('a0000000-0000-4000-8000-000000000012', 'brooches', 'TEST-012', 'published', 'made_to_order', 'available', null, 19.90, 7, interval '60 days', null),
  ('a0000000-0000-4000-8000-000000000013', 'brooches', 'TEST-013', 'archived', 'one_of_a_kind', 'sold', null, 26.00, 6, interval '90 days', null),
  ('a0000000-0000-4000-8000-000000000014', 'bracelets', 'TEST-014', 'published', 'made_to_order', 'available', null, 23.00, 9, interval '70 days', interval '1 day')
) as p (id, category, sku, status, fulfillment, availability, lead_time_days, price_usd, weight_g, age, deleted_ago)
join public.categories c on c.slug = p.category;

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

-- Materials and care, per locale like every user-visible text (en and uk; the other locales have none).
update public.product_translations t
set materials = v.materials, care = v.care
from (values
  ('TEST-001', 'en', 'Brass, gold-tone plating, synthetic coral', 'Keep dry; store separately'),
  ('TEST-001', 'uk', 'Латунь, золотисте покриття, синтетичний корал', 'Берегти від вологи; зберігати окремо'),
  ('TEST-002', 'en', 'Stainless steel, glass pearl', 'Wipe with a soft cloth'),
  ('TEST-002', 'uk', 'Нержавна сталь, скляна перлина', 'Протирати м''якою тканиною'),
  ('TEST-003', 'en', 'Brass, gold-tone plating', 'Avoid perfume and water'),
  ('TEST-003', 'uk', 'Латунь, золотисте покриття', 'Уникати парфумів і води'),
  ('TEST-004', 'en', 'Brass, gold-tone plating', 'Keep dry; store flat'),
  ('TEST-004', 'uk', 'Латунь, золотисте покриття', 'Берегти від вологи; зберігати розкладеним'),
  ('TEST-005', 'en', 'Zinc alloy, crystal', 'Wipe with a soft cloth'),
  ('TEST-005', 'uk', 'Цинковий сплав, кристал', 'Протирати м''якою тканиною'),
  ('TEST-006', 'en', 'Glass beads, elastic cord', 'Do not overstretch'),
  ('TEST-006', 'uk', 'Скляні намистини, еластичний шнур', 'Не розтягувати надмірно'),
  ('TEST-007', 'en', 'Stainless steel', 'Wipe with a soft cloth'),
  ('TEST-007', 'uk', 'Нержавна сталь', 'Протирати м''якою тканиною'),
  ('TEST-008', 'en', 'Synthetic coral, silk thread', 'Keep away from water and cosmetics'),
  ('TEST-008', 'uk', 'Синтетичний корал, шовкова нитка', 'Берегти від води та косметики'),
  ('TEST-009', 'en', 'Synthetic coral, elastic cord', 'Keep away from water and cosmetics'),
  ('TEST-009', 'uk', 'Синтетичний корал, еластичний шнур', 'Берегти від води та косметики'),
  ('TEST-010', 'en', 'Brass, silver-tone plating', 'Remove before washing hands'),
  ('TEST-010', 'uk', 'Латунь, сріблясте покриття', 'Знімати перед миттям рук'),
  ('TEST-011', 'en', 'Brass, glass stone', 'Remove before washing hands'),
  ('TEST-011', 'uk', 'Латунь, скляний камінь', 'Знімати перед миттям рук'),
  ('TEST-012', 'en', 'Zinc alloy, enamel', 'Store in a pouch'),
  ('TEST-012', 'uk', 'Цинковий сплав, емаль', 'Зберігати в мішечку'),
  ('TEST-013', 'en', 'Brass, enamel', 'Store in a pouch'),
  ('TEST-013', 'uk', 'Латунь, емаль', 'Зберігати в мішечку'),
  ('TEST-014', 'en', 'Stainless steel', 'Wipe with a soft cloth'),
  ('TEST-014', 'uk', 'Нержавна сталь', 'Протирати м''якою тканиною')
) as v (sku, locale, materials, care)
join public.products p on p.sku = v.sku
where t.product_id = p.id and t.locale = v.locale;

-- Exchange rates for local work and e2e: the NBU rates of 2026-10-15 (UAH per unit), the USD→X cross rates
-- derived from them as the daily job does (rounded to 10 places), and display rates equal to the cross rates.
with nbu (currency, rate) as (
  values ('USD', 44.9801), ('EUR', 50.3453), ('PLN', 11.5297), ('CZK', 2.0669), ('RON', 9.4209), ('CHF', 53.9899)
),
cross_rates (quote, rate) as (
  select 'UAH', (select rate from nbu where currency = 'USD')
  union all
  select currency, round((select rate from nbu where currency = 'USD') / rate, 10) from nbu where currency <> 'USD'
)
insert into public.fx_rates (rate_date, base, quote, rate, source)
select date '2026-10-15', currency, 'UAH', rate, 'nbu' from nbu
union all
select date '2026-10-15', 'USD', quote, rate, 'nbu' from cross_rates where quote <> 'UAH'
union all
select date '2026-10-15', 'USD', quote, rate, 'display' from cross_rates;
