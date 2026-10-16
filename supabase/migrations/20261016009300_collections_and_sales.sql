-- Collections and discounts (#67, D29).
--
-- collections               a group of pieces the owner puts together («Весна»): its place in the list, whether it
--                           is published, an optional cover photo (in the product-images bucket)
-- collection_translations   its name, URL slug and description per locale, with the translation's source and
--                           review state (an unreviewed machine text is shown, never indexed, as for products)
-- collection_products       the pieces of a collection in the owner's order
-- product_sales             a product's sale: a percentage off or a fixed sale price in USD cents, optionally from
--                           and/or until a time
-- collection_sales          a percentage off every piece of a published collection, with the same optional window
--
-- A sale applies to every size of a product (#66) with the size's price difference kept: a percentage of the
-- size's own price, or the fixed sale price plus the size's difference. When several sales apply to one price (the
-- product's own and its collections'), the lowest resulting price wins. A sale price is never above the regular
-- price and never below 1 cent; a percentage is rounded to the cent, half up. The same rule is
-- src/lib/catalog/sale.ts; the listing filters and sorts by it (private.shop_candidates).
--
-- Access: the public reads published collections, their translations and their published pieces, and only the
-- sales running now of what it can see; admins write.

-- the listing functions below set a pg_trgm parameter: load the module in this session first (20261016007650)
select extensions.similarity('a', 'a');

-- Collections ------------------------------------------------------------------------------------------------

create table public.collections (
  id                  uuid primary key default gen_random_uuid(),
  is_published        boolean not null default false,
  position            integer not null default 0,
  -- the cover photo: a re-encoded upload under collections/<id>/ in the public product-images bucket (#18 rules)
  cover_storage_path  text check (btrim(cover_storage_path) <> ''),
  cover_width         integer check (cover_width > 0),
  cover_height        integer check (cover_height > 0),
  cover_blur_data_url text check (cover_blur_data_url like 'data:image/%' and length(cover_blur_data_url) <= 4096),
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,
  constraint collections_cover check (num_nulls(cover_storage_path, cover_width, cover_height) in (0, 3)
                                      and (cover_storage_path is not null or cover_blur_data_url is null))
);

create index collections_position_idx on public.collections (position) where is_published;
create index collections_created_by_idx on public.collections (created_by);
create index collections_updated_by_idx on public.collections (updated_by);

create trigger collections_audit
  before insert or update on public.collections
  for each row execute function private.set_audit_columns();

-- published_at records the first publication (as for products)
create function private.set_collection_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger collections_published_at
  before insert or update of is_published on public.collections
  for each row execute function private.set_collection_published_at();

create table public.collection_translations (
  collection_id uuid not null references public.collections (id) on delete cascade,
  locale        public.locale not null,
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  name          text not null check (btrim(name) <> '' and char_length(name) <= 120),
  description   text check (btrim(description) <> '' and char_length(description) <= 5000),
  source        public.translation_source not null default 'human',
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (collection_id, locale),
  unique (locale, slug)
);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger collection_translations_touch
  before update on public.collection_translations
  for each row execute function private.touch_updated_at();

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (collection_id, product_id)
);

create index collection_products_product_idx on public.collection_products (product_id);
create index collection_products_position_idx on public.collection_products (collection_id, position);

-- Sales ------------------------------------------------------------------------------------------------------

create table public.product_sales (
  product_id      uuid primary key references public.products (id) on delete cascade,
  -- one of the two: a percentage off (1-99), or the sale price in US cents (a technical bound of $10 million)
  percent_off     smallint check (percent_off between 1 and 99),
  price_usd_minor integer check (price_usd_minor between 1 and 1000000000),
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  constraint product_sales_kind check (num_nonnulls(percent_off, price_usd_minor) = 1),
  constraint product_sales_window check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index product_sales_created_by_idx on public.product_sales (created_by);
create index product_sales_updated_by_idx on public.product_sales (updated_by);

create trigger product_sales_audit
  before insert or update on public.product_sales
  for each row execute function private.set_audit_columns();

-- a whole collection: a percentage only (a fixed price would give every piece the same price)
create table public.collection_sales (
  collection_id uuid primary key references public.collections (id) on delete cascade,
  percent_off   smallint not null check (percent_off between 1 and 99),
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  constraint collection_sales_window check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index collection_sales_created_by_idx on public.collection_sales (created_by);
create index collection_sales_updated_by_idx on public.collection_sales (updated_by);

create trigger collection_sales_audit
  before insert or update on public.collection_sales
  for each row execute function private.set_audit_columns();

-- Access -----------------------------------------------------------------------------------------------------

alter table public.collections enable row level security;
alter table public.collection_translations enable row level security;
alter table public.collection_products enable row level security;
alter table public.product_sales enable row level security;
alter table public.collection_sales enable row level security;

revoke all on table
  public.collections, public.collection_translations, public.collection_products, public.product_sales,
  public.collection_sales
from anon, authenticated;

-- the storefront columns; who wrote a row is internal (as for the catalog)
grant select (
  id, is_published, position, cover_storage_path, cover_width, cover_height, cover_blur_data_url, published_at,
  created_at, updated_at
) on table public.collections to anon, authenticated;
grant select on table public.collection_translations, public.collection_products to anon, authenticated;
grant select (product_id, percent_off, price_usd_minor, starts_at, ends_at, created_at, updated_at)
  on table public.product_sales to anon, authenticated;
grant select (collection_id, percent_off, starts_at, ends_at, created_at, updated_at)
  on table public.collection_sales to anon, authenticated;
grant insert, update, delete on table
  public.collections, public.collection_translations, public.collection_products, public.product_sales,
  public.collection_sales
to authenticated;

create policy "collections: everyone reads published ones, admins read all"
  on public.collections for select to anon, authenticated
  using (is_published or (select public.is_admin()));
create policy "collections: admins insert"
  on public.collections for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "collections: admins update"
  on public.collections for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "collections: admins delete"
  on public.collections for delete to authenticated
  using ((select public.is_admin()));

-- the subqueries run under the collections and products policies
create policy "collection_translations: readable with their collection"
  on public.collection_translations for select to anon, authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id));
create policy "collection_translations: admins insert"
  on public.collection_translations for insert to authenticated
  with check ((select public.is_admin()));
create policy "collection_translations: admins update"
  on public.collection_translations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "collection_translations: admins delete"
  on public.collection_translations for delete to authenticated
  using ((select public.is_admin()));

create policy "collection_products: readable with their collection and product"
  on public.collection_products for select to anon, authenticated
  using (
    exists (select 1 from public.collections c where c.id = collection_id)
    and exists (select 1 from public.products p where p.id = product_id)
  );
create policy "collection_products: admins insert"
  on public.collection_products for insert to authenticated
  with check ((select public.is_admin()));
create policy "collection_products: admins update"
  on public.collection_products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "collection_products: admins delete"
  on public.collection_products for delete to authenticated
  using ((select public.is_admin()));

-- The public sees a sale only while it runs (a planned one stays the owner's), and only of what it can see; an
-- admin sees every sale.
create policy "product_sales: running ones readable with their product, admins read all"
  on public.product_sales for select to anon, authenticated
  using (
    (select public.is_admin())
    or ((starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        and exists (select 1 from public.products p where p.id = product_id))
  );
create policy "product_sales: admins insert"
  on public.product_sales for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "product_sales: admins update"
  on public.product_sales for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "product_sales: admins delete"
  on public.product_sales for delete to authenticated
  using ((select public.is_admin()));

create policy "collection_sales: running ones readable with their collection, admins read all"
  on public.collection_sales for select to anon, authenticated
  using (
    (select public.is_admin())
    or ((starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        and exists (select 1 from public.collections c where c.id = collection_id))
  );
create policy "collection_sales: admins insert"
  on public.collection_sales for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "collection_sales: admins update"
  on public.collection_sales for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "collection_sales: admins delete"
  on public.collection_sales for delete to authenticated
  using ((select public.is_admin()));

-- Prices -----------------------------------------------------------------------------------------------------

-- The price of one of a product's prices at p_at: the regular price p_price_minor + p_delta_minor (the product's
-- own price and a size's difference, US cents), lowered by the sales running then (the product's own, and those
-- of its published collections). Called by the security definer listing functions.
create function private.sale_price_minor(p_product_id uuid, p_price_minor bigint, p_delta_minor bigint, p_at timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  with running as (
    select s.percent_off, s.price_usd_minor
    from public.product_sales s
    where s.product_id = p_product_id
      and (s.starts_at is null or s.starts_at <= p_at) and (s.ends_at is null or s.ends_at > p_at)
    union all
    select s.percent_off, null
    from public.collection_sales s
    join public.collections c on c.id = s.collection_id and c.is_published
    join public.collection_products cp on cp.collection_id = s.collection_id and cp.product_id = p_product_id
    where (s.starts_at is null or s.starts_at <= p_at) and (s.ends_at is null or s.ends_at > p_at)
  )
  select least(
    p_price_minor + p_delta_minor,
    coalesce(
      (select min(greatest(1, case
          when r.percent_off is not null then ((p_price_minor + p_delta_minor) * (100 - r.percent_off) + 50) / 100
          else r.price_usd_minor + p_delta_minor
        end)) from running r),
      p_price_minor + p_delta_minor
    )
  );
$$;

revoke all on function private.sale_price_minor(uuid, bigint, bigint, timestamptz) from public;

-- The next moment a sale starts or ends: the storefront's cached pages live no longer than until then.
create function public.next_sale_change()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select min(t) from (
    select starts_at as t from public.product_sales where starts_at > now()
    union all select ends_at from public.product_sales where ends_at > now()
    union all select starts_at from public.collection_sales where starts_at > now()
    union all select ends_at from public.collection_sales where ends_at > now()
  ) as changes;
$$;

revoke all on function public.next_sale_change() from public;
grant execute on function public.next_sale_change() to anon, authenticated, service_role;

-- Listings (shop_search / shop_facets of 20261016007500, 20261016007700) ---------------------------------------
-- A collection's page lists its pieces (p_collection, sorted in the owner's order with p_sort 'position'); the
-- listing filters and sorts by the price its cards show, now with the sale applied. Otherwise unchanged.

drop function public.shop_search(public.locale, text, text[], text[], text[], bigint, bigint, text[], text, integer, integer);
drop function public.shop_facets(public.locale, text, text[], text[], text[], bigint, bigint, text[]);
drop function private.shop_candidates(public.locale, text, text[], text[], text[], bigint, bigint, text[]);

create function private.shop_candidates(
  p_locale public.locale,
  p_category text,
  p_terms text[],
  p_materials text[],
  p_colours text[],
  p_price_min_minor bigint,
  p_price_max_minor bigint,
  p_availability text[],
  p_collection uuid
)
returns table (
  product_id uuid,
  rank real,
  created_at timestamptz,
  price_usd numeric,
  collection_position integer,
  bucket text,
  material_ok boolean,
  colour_ok boolean,
  availability_ok boolean
)
language plpgsql
stable
-- the typo match: a title word at least half similar to the query (the default 0.6 misses "corol" → "coral")
set pg_trgm.word_similarity_threshold = 0.5
set search_path = ''
as $$
declare
  v_terms        text[] := coalesce(p_terms, '{}');
  v_materials    text[] := coalesce(p_materials, '{}');
  v_colours      text[] := coalesce(p_colours, '{}');
  v_availability text[] := coalesce(p_availability, '{}');
  v_text         text;
  v_tsq_locale   tsquery;
  v_tsq_en       tsquery;
begin
  if p_locale is null then
    raise exception 'locale is required' using errcode = '22023';
  end if;
  if cardinality(v_terms) > 8 or exists (select 1 from unnest(v_terms) t where t is null or length(t) not between 1 and 64) then
    raise exception 'invalid search terms' using errcode = '22023';
  end if;
  if cardinality(v_materials) > 50 or cardinality(v_colours) > 50 then
    raise exception 'too many filter values' using errcode = '22023';
  end if;
  if not v_availability <@ array['in_stock', 'made_to_order'] then
    raise exception 'invalid availability' using errcode = '22023';
  end if;
  if p_price_min_minor < 0 or p_price_max_minor < 0 then
    raise exception 'invalid price bounds' using errcode = '22023';
  end if;

  v_text := array_to_string(v_terms, ' ');
  v_tsq_locale := private.prefix_tsquery(private.search_config(p_locale), v_terms);
  v_tsq_en := private.prefix_tsquery('pg_catalog.english', v_terms);

  return query
  with matched as (
    -- the visitor's locale and the fallback en: a product matches through either translation, its own
    -- locale ranking higher; the three conditions each use an index (search vector, title trigrams). The
    -- rank adds the full-text rank to the title's word similarity, so a typo match (trigrams only, no
    -- full-text rank, similarity below 1) ranks below a match of the words themselves
    select t.product_id,
      max(
        -- ts_rank_cd is strict: no rank without a query (every term a stop word)
        (coalesce(pg_catalog.ts_rank_cd(t.search_vector, case when t.locale = p_locale then v_tsq_locale else v_tsq_en end), 0)
          + extensions.word_similarity(v_text, t.title))
        * case when t.locale = p_locale then 1.0 else 0.8 end
      )::real as rank
    from public.product_translations t
    where cardinality(v_terms) > 0
      and t.locale in (p_locale, 'en')
      and (
        (t.locale = p_locale and t.search_vector @@ v_tsq_locale)
        or (t.locale = 'en' and t.search_vector @@ v_tsq_en)
        or (length(v_text) >= 4 and t.title operator(extensions.%>) v_text)
      )
    group by t.product_id
  ),
  products as (
    select p.id, p.created_at, p.price_usd,
      -- the card's lowest regular price (a size's, #66) as a difference to the product's price: the sale keeps it
      round(private.listing_price_usd(p.id, p.price_usd) * 100)::bigint - round(p.price_usd * 100)::bigint as delta_minor,
      cp.position as collection_position,
      case
        when p.fulfillment = 'made_to_order' then 'made_to_order'
        when p.availability = 'available' then 'in_stock'
      end as bucket,
      m.rank
    from public.products p
    join public.categories c on c.id = p.category_id
    left join matched m on m.product_id = p.id
    left join public.collection_products cp on cp.collection_id = p_collection and cp.product_id = p.id
    where p.status = 'published'
      and p.deleted_at is null
      and (p_category is null or c.slug = p_category)
      and (p_collection is null or (cp.product_id is not null
        and exists (select 1 from public.collections co where co.id = p_collection and co.is_published)))
      and (cardinality(v_terms) = 0 or m.product_id is not null)
      -- shown only with a translation in the locale or the fallback (as the storefront reads it)
      and exists (select 1 from public.product_translations t where t.product_id = p.id and t.locale in (p_locale, 'en'))
  ),
  priced as (
    select p.*, private.sale_price_minor(p.id, round(p.price_usd * 100)::bigint, p.delta_minor, now()) as price_minor
    from products p
  )
  select p.id, p.rank, p.created_at, p.price_minor / 100.0, p.collection_position, p.bucket,
    cardinality(v_materials) = 0 or exists (
      select 1 from public.product_taxonomy_terms pt
      join public.taxonomy_terms tt on tt.id = pt.term_id
      where pt.product_id = p.id and tt.kind = 'material' and tt.slug = any (v_materials)
    ),
    cardinality(v_colours) = 0 or exists (
      select 1 from public.product_taxonomy_terms pt
      join public.taxonomy_terms tt on tt.id = pt.term_id
      where pt.product_id = p.id and tt.kind = 'colour' and tt.slug = any (v_colours)
    ),
    cardinality(v_availability) = 0 or p.bucket = any (v_availability)
  from priced p
  where (p_price_min_minor is null or p.price_minor >= p_price_min_minor)
    and (p_price_max_minor is null or p.price_minor <= p_price_max_minor);
end;
$$;

revoke all on function private.shop_candidates(public.locale, text, text[], text[], text[], bigint, bigint, text[], uuid) from public;

-- p_sort: newest, price_asc, price_desc, relevance (search only; newest without search terms) or position (the
-- owner's order of p_collection; newest without a collection).
create function public.shop_search(
  p_locale public.locale,
  p_category text default null,
  p_terms text[] default null,
  p_materials text[] default null,
  p_colours text[] default null,
  p_price_min_minor bigint default null,
  p_price_max_minor bigint default null,
  p_availability text[] default null,
  p_sort text default 'newest',
  p_limit integer default 20,
  p_offset integer default 0,
  p_collection uuid default null
)
returns table (ids uuid[], total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_sort is null or p_sort not in ('newest', 'price_asc', 'price_desc', 'relevance', 'position') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid page' using errcode = '22023';
  end if;

  return query
  with listed as (
    select c.product_id, c.rank, c.created_at, c.price_usd, c.collection_position
    from private.shop_candidates(p_locale, p_category, p_terms, p_materials, p_colours, p_price_min_minor,
      p_price_max_minor, p_availability, p_collection) c
    where c.material_ok and c.colour_ok and c.availability_ok
  ),
  page as (
    select l.product_id, row_number() over (
      order by
        case when p_sort = 'relevance' then l.rank end desc nulls last,
        case when p_sort = 'position' then l.collection_position end asc nulls last,
        case when p_sort = 'price_asc' then l.price_usd end asc,
        case when p_sort = 'price_desc' then l.price_usd end desc,
        l.created_at desc,
        l.product_id
    ) as n
    from listed l
  )
  select
    coalesce((select array_agg(pg.product_id order by pg.n) from page pg where pg.n > p_offset and pg.n <= p_offset + p_limit), '{}'),
    (select count(*) from listed);
end;
$$;

create function public.shop_facets(
  p_locale public.locale,
  p_category text default null,
  p_terms text[] default null,
  p_materials text[] default null,
  p_colours text[] default null,
  p_price_min_minor bigint default null,
  p_price_max_minor bigint default null,
  p_availability text[] default null,
  p_collection uuid default null
)
returns table (facet text, value text, count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select * from private.shop_candidates(p_locale, p_category, p_terms, p_materials, p_colours,
      p_price_min_minor, p_price_max_minor, p_availability, p_collection)
  )
  select tt.kind::text, tt.slug, count(*)
  from candidates c
  join public.product_taxonomy_terms pt on pt.product_id = c.product_id
  join public.taxonomy_terms tt on tt.id = pt.term_id
  where (tt.kind = 'material' and c.colour_ok and c.availability_ok)
     or (tt.kind = 'colour' and c.material_ok and c.availability_ok)
  group by tt.kind, tt.slug
  union all
  select 'availability', c.bucket, count(*)
  from candidates c
  where c.bucket is not null and c.material_ok and c.colour_ok
  group by c.bucket;
$$;

revoke all on function public.shop_search(public.locale, text, text[], text[], text[], bigint, bigint, text[], text, integer, integer, uuid) from public;
revoke all on function public.shop_facets(public.locale, text, text[], text[], text[], bigint, bigint, text[], uuid) from public;
grant execute on function public.shop_search(public.locale, text, text[], text[], text[], bigint, bigint, text[], text, integer, integer, uuid)
  to anon, authenticated, service_role;
grant execute on function public.shop_facets(public.locale, text, text[], text[], text[], bigint, bigint, text[], uuid)
  to anon, authenticated, service_role;

-- Orders -----------------------------------------------------------------------------------------------------
-- An order line keeps the regular unit price next to the price charged (unit_price_*, the sale price while a sale
-- ran): in USD and in the order's currency, as the customer saw both. Lines stored before this, and any writer that
-- leaves them out, get the unit price (no sale). Additive: the readers of order_items are unchanged.

alter table public.order_items
  add column regular_unit_price_usd_minor bigint,
  add column regular_unit_price_minor bigint;

update public.order_items
set regular_unit_price_usd_minor = unit_price_usd_minor, regular_unit_price_minor = unit_price_minor;

create function private.default_regular_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.regular_unit_price_usd_minor := coalesce(new.regular_unit_price_usd_minor, new.unit_price_usd_minor);
  new.regular_unit_price_minor := coalesce(new.regular_unit_price_minor, new.unit_price_minor);
  return new;
end;
$$;

revoke all on function private.default_regular_prices() from public;

create trigger order_items_regular_prices
  before insert or update on public.order_items
  for each row execute function private.default_regular_prices();

-- always set (the trigger above fills them); a check rather than NOT NULL keeps them optional for writers that
-- leave them out (the generated Insert types follow NOT NULL, not checks)
alter table public.order_items
  add constraint order_items_regular_price
    check (regular_unit_price_usd_minor is not null and regular_unit_price_minor is not null
           and regular_unit_price_usd_minor >= unit_price_usd_minor and regular_unit_price_minor >= unit_price_minor);

-- create_order_request (20261016007700) stores the regular unit prices the server priced the line with.
create or replace function public.create_order_request(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order       public.orders;
  v_item        jsonb;
  v_product     record;
  v_variant     record;
  v_product_id  uuid;
  v_variant_id  uuid;
  v_sku         text;
  v_unavailable uuid[] := '{}';
  v_usd_total   bigint := 0;
  v_total       bigint := 0;
begin
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'p_order must be an object' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one line' using errcode = '22023';
  end if;

  begin
    insert into public.orders (
      user_id, idempotency_key, locale,
      first_name, last_name, phone, email, comment,
      country, delivery_carrier, delivery_method, delivery_destination,
      delivery_estimate_state, delivery_estimate_source, delivery_estimate_minor, delivery_estimate_currency,
      delivery_estimate_decimals, currency, currency_decimals, fx_rate, fx_rate_date, markup_bps,
      items_total_usd_minor, items_total_minor
    ) values (
      (p_order ->> 'user_id')::uuid,
      (p_order ->> 'idempotency_key')::uuid,
      (p_order ->> 'locale')::public.locale,
      p_order ->> 'first_name',
      p_order ->> 'last_name',
      p_order ->> 'phone',
      p_order ->> 'email',
      p_order ->> 'comment',
      p_order ->> 'country',
      p_order ->> 'delivery_carrier',
      p_order ->> 'delivery_method',
      p_order -> 'delivery_destination',
      p_order ->> 'delivery_estimate_state',
      p_order ->> 'delivery_estimate_source',
      (p_order ->> 'delivery_estimate_minor')::bigint,
      p_order ->> 'delivery_estimate_currency',
      (p_order ->> 'delivery_estimate_decimals')::smallint,
      p_order ->> 'currency',
      (p_order ->> 'currency_decimals')::smallint,
      (p_order ->> 'fx_rate')::numeric,
      (p_order ->> 'fx_rate_date')::date,
      (p_order ->> 'markup_bps')::integer,
      (p_order ->> 'items_total_usd_minor')::bigint,
      (p_order ->> 'items_total_minor')::bigint
    )
    on conflict (idempotency_key) do nothing
    returning * into v_order;

    if v_order.id is null then
      select * into strict v_order from public.orders where idempotency_key = (p_order ->> 'idempotency_key')::uuid;
      return jsonb_build_object(
        'ok', true, 'replayed', true, 'order_id', v_order.id, 'number', v_order.number, 'user_id', v_order.user_id
      );
    end if;

    -- product order: two requests that share pieces lock them in the same order (no deadlock)
    for v_item in
      select value from jsonb_array_elements(p_items) order by value ->> 'product_id', (value ->> 'position')::int
    loop
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_variant_id := (v_item ->> 'variant_id')::uuid;
      select p.fulfillment, p.status, p.deleted_at, p.sku into v_product from public.products p where p.id = v_product_id;
      if not found or v_product.status <> 'published' or v_product.deleted_at is not null then
        v_unavailable := v_unavailable || v_product_id;
        continue;
      end if;

      v_sku := v_product.sku;
      if v_variant_id is null then
        if exists (select 1 from public.product_variants where product_id = v_product_id and deleted_at is null) then
          v_unavailable := v_unavailable || v_product_id;
          continue;
        end if;
      else
        select v.product_id, v.deleted_at, v.is_available, v.sku_suffix into v_variant
        from public.product_variants v where v.id = v_variant_id for share;
        if not found or v_variant.product_id <> v_product_id or v_variant.deleted_at is not null or not v_variant.is_available then
          v_unavailable := v_unavailable || v_product_id;
          continue;
        end if;
        if v_sku is not null and v_variant.sku_suffix is not null then
          v_sku := v_sku || '-' || v_variant.sku_suffix;
        end if;
      end if;

      if v_product.fulfillment = 'one_of_a_kind' and not private.reserve_one_of_a_kind(v_product_id) then
        v_unavailable := v_unavailable || v_product_id;
        continue;
      end if;

      insert into public.order_items (
        order_id, position, product_id, variant_id, sku, fulfillment, title, title_locale, variant_label,
        variant_label_locale, quantity, unit_price_usd_minor, unit_price_minor, line_total_usd_minor, line_total_minor,
        regular_unit_price_usd_minor, regular_unit_price_minor
      ) values (
        v_order.id,
        (v_item ->> 'position')::smallint,
        v_product_id,
        v_variant_id,
        v_sku,
        v_product.fulfillment,
        v_item ->> 'title',
        (v_item ->> 'title_locale')::public.locale,
        case when v_variant_id is not null then v_item ->> 'variant_label' end,
        case when v_variant_id is not null then (v_item ->> 'variant_label_locale')::public.locale end,
        (v_item ->> 'quantity')::integer,
        (v_item ->> 'unit_price_usd_minor')::bigint,
        (v_item ->> 'unit_price_minor')::bigint,
        (v_item ->> 'unit_price_usd_minor')::bigint * (v_item ->> 'quantity')::integer,
        (v_item ->> 'unit_price_minor')::bigint * (v_item ->> 'quantity')::integer,
        (v_item ->> 'regular_unit_price_usd_minor')::bigint,
        (v_item ->> 'regular_unit_price_minor')::bigint
      );
      v_usd_total := v_usd_total + (v_item ->> 'unit_price_usd_minor')::bigint * (v_item ->> 'quantity')::integer;
      v_total := v_total + (v_item ->> 'unit_price_minor')::bigint * (v_item ->> 'quantity')::integer;
    end loop;

    if cardinality(v_unavailable) > 0 then
      raise exception 'unavailable pieces' using errcode = 'TJ409';
    end if;
    if v_usd_total <> v_order.items_total_usd_minor or v_total <> v_order.items_total_minor then
      raise exception 'the totals do not match the lines' using errcode = '22023';
    end if;

    insert into public.outbox_events (event, order_id, payload)
    values ('order_created', v_order.id, jsonb_build_object('number', v_order.number));

    return jsonb_build_object(
      'ok', true, 'replayed', false, 'order_id', v_order.id, 'number', v_order.number, 'user_id', v_order.user_id
    );
  exception when sqlstate 'TJ409' then
    -- the block's writes (the order, its lines, the reservations) are undone; the variables keep their values
    return jsonb_build_object(
      'ok', false, 'reason', 'unavailable', 'product_ids', to_jsonb(v_unavailable)
    );
  end;
end;
$$;

revoke all on function public.create_order_request(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_request(jsonb, jsonb) to service_role;

-- Admin writes -----------------------------------------------------------------------------------------------
-- Security invoker like admin_save_product: RLS, the grants and the audit trigger apply to the caller; the explicit
-- admin check only gives a clear refusal. The sales are written as plain rows under RLS.

-- Creates (p_id null) or updates a collection with its translations. p_collection: { "is_published", "position" };
-- p_translations: [{ locale, slug, name, description?, source? }] replaces the stored ones. Publishing needs the
-- uk translation (the shop's main market, as for a product); a slug another collection has in that locale is 23505.
create function public.admin_save_collection(p_id uuid, p_collection jsonb, p_translations jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id        uuid := p_id;
  v_published boolean := coalesce((p_collection ->> 'is_published')::boolean, false);
  v_locales   text[];
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins save collections' using errcode = '42501';
  end if;
  if jsonb_typeof(p_collection) is distinct from 'object' or jsonb_typeof(p_translations) is distinct from 'array'
    or jsonb_array_length(p_translations) = 0 then
    raise exception 'a collection needs its fields and a translation' using errcode = '22023';
  end if;
  select array_agg(t ->> 'locale') into v_locales from jsonb_array_elements(p_translations) t;
  if v_published and not ('uk' = any (v_locales)) then
    raise exception 'a published collection needs its uk translation' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.collections (is_published, position)
    values (v_published, coalesce((p_collection ->> 'position')::integer, 0))
    returning id into v_id;
  else
    update public.collections set
      is_published = v_published,
      position     = coalesce((p_collection ->> 'position')::integer, 0)
    where id = v_id;
    if not found then
      raise exception 'collection % not found', v_id using errcode = 'P0002';
    end if;
  end if;

  delete from public.collection_translations where collection_id = v_id and not (locale = any (v_locales));
  insert into public.collection_translations (collection_id, locale, slug, name, description, source)
  select v_id, t.locale, t.slug, btrim(t.name), nullif(btrim(t.description), ''), coalesce(t.source, 'human')
  from jsonb_to_recordset(p_translations) as t (locale public.locale, slug text, name text, description text, source public.translation_source)
  on conflict (collection_id, locale) do update set
    slug        = excluded.slug,
    name        = excluded.name,
    description = excluded.description,
    source      = excluded.source,
    -- a changed text is a new text: its review is taken back unless it is the admin's own (human) text
    reviewed_at = case when excluded.source = 'human' then null else collection_translations.reviewed_at end;

  return v_id;
end;
$$;

-- One tap in the list: publish (needs the uk translation) or unpublish.
create function public.admin_set_collection_published(p_id uuid, p_published boolean)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change collections' using errcode = '42501';
  end if;
  if p_published and not exists (select 1 from public.collection_translations where collection_id = p_id and locale = 'uk') then
    raise exception 'a published collection needs its uk translation' using errcode = '23514';
  end if;
  update public.collections set is_published = coalesce(p_published, false) where id = p_id;
  return found;
end;
$$;

-- The collection's pieces, exactly these, in this order (adding, removing and reordering are one list). At most
-- 500: a technical bound far above a real collection. The collection row is locked so two saves queue.
create function public.admin_set_collection_products(p_id uuid, p_product_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_product_ids, '{}');
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change collections' using errcode = '42501';
  end if;
  if cardinality(v_ids) > 500 or cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'invalid product list' using errcode = '22023';
  end if;
  perform 1 from public.collections where id = p_id for update;
  if not found then
    raise exception 'collection % not found', p_id using errcode = 'P0002';
  end if;

  delete from public.collection_products where collection_id = p_id and not (product_id = any (v_ids));
  insert into public.collection_products (collection_id, product_id, position)
  select p_id, o.id, (o.ord - 1)::integer from unnest(v_ids) with ordinality as o (id, ord)
  on conflict (collection_id, product_id) do update set position = excluded.position
  where collection_products.position is distinct from excluded.position;
end;
$$;

-- Sets (a path) or removes (null) the cover photo; returns the path it replaced, for the file's removal.
create function public.admin_set_collection_cover(
  p_id uuid,
  p_storage_path text,
  p_width integer,
  p_height integer,
  p_blur_data_url text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous text;
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change collections' using errcode = '42501';
  end if;
  select cover_storage_path into v_previous from public.collections where id = p_id for update;
  if not found then
    raise exception 'collection % not found', p_id using errcode = 'P0002';
  end if;
  update public.collections set
    cover_storage_path  = p_storage_path,
    cover_width         = case when p_storage_path is null then null else p_width end,
    cover_height        = case when p_storage_path is null then null else p_height end,
    cover_blur_data_url = case when p_storage_path is null then null else p_blur_data_url end
  where id = p_id;
  return v_previous;
end;
$$;

-- Deletes a collection with its translations, pieces list and sale (the products stay); returns its cover path.
create function public.admin_delete_collection(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cover text;
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins delete collections' using errcode = '42501';
  end if;
  delete from public.collections where id = p_id returning cover_storage_path into v_cover;
  return jsonb_build_object('deleted', found, 'cover_storage_path', v_cover);
end;
$$;

-- Supabase default privileges grant EXECUTE on new public functions to anon directly: revoke it explicitly.
revoke all on function public.admin_save_collection(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.admin_set_collection_published(uuid, boolean) from public, anon;
revoke all on function public.admin_set_collection_products(uuid, uuid[]) from public, anon;
revoke all on function public.admin_set_collection_cover(uuid, text, integer, integer, text) from public, anon;
revoke all on function public.admin_delete_collection(uuid) from public, anon;
grant execute on function public.admin_save_collection(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.admin_set_collection_published(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_set_collection_products(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_set_collection_cover(uuid, text, integer, integer, text) to authenticated, service_role;
grant execute on function public.admin_delete_collection(uuid) to authenticated, service_role;
