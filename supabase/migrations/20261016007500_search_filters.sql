-- Search and filters (#25): materials and colours as translated lists the admin manages (D29: filter by
-- material), assigned to products; the storefront's full-text search over the visitor's locale with a
-- fallback to en (prefix matching, typo tolerance by trigrams); and the listing's filters with counts per
-- option. The lists start empty: the owner enters the values in the admin.

create extension if not exists pg_trgm with schema extensions;

-- Taxonomies -----------------------------------------------------------------------------------------------
-- One table for both lists: a term is a material or a colour. The slug names it in shop URLs
-- (?material=<slug>); it is set once when the term is created, so a renamed term keeps its shared links.

create type public.taxonomy_kind as enum ('material', 'colour');

create table public.taxonomy_terms (
  id         uuid primary key default gen_random_uuid(),
  kind       public.taxonomy_kind not null,
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  unique (kind, slug)
);

create index taxonomy_terms_kind_position_idx on public.taxonomy_terms (kind, position);
create index taxonomy_terms_created_by_idx on public.taxonomy_terms (created_by);
create index taxonomy_terms_updated_by_idx on public.taxonomy_terms (updated_by);

create trigger taxonomy_terms_audit
  before insert or update on public.taxonomy_terms
  for each row execute function private.set_audit_columns();

create table public.taxonomy_term_translations (
  term_id uuid not null references public.taxonomy_terms (id) on delete cascade,
  locale  public.locale not null,
  name    text not null check (btrim(name) <> '' and length(name) <= 80),
  source  public.translation_source not null default 'human',
  primary key (term_id, locale)
);

-- A term in use cannot be deleted (restrict); admin_delete_taxonomy_term says so instead of failing.
create table public.product_taxonomy_terms (
  product_id uuid not null references public.products (id) on delete cascade,
  term_id    uuid not null references public.taxonomy_terms (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, term_id)
);

-- the filters look products up by term
create index product_taxonomy_terms_term_idx on public.product_taxonomy_terms (term_id, product_id);

alter table public.taxonomy_terms enable row level security;
alter table public.taxonomy_term_translations enable row level security;
alter table public.product_taxonomy_terms enable row level security;

revoke all on table public.taxonomy_terms, public.taxonomy_term_translations, public.product_taxonomy_terms
from anon, authenticated;

-- the storefront columns only (who created or changed a term is internal, as for the catalog)
grant select (id, kind, slug, position, created_at, updated_at) on table public.taxonomy_terms to anon, authenticated;
grant select on table public.taxonomy_term_translations, public.product_taxonomy_terms to anon, authenticated;
grant insert, update, delete on table
  public.taxonomy_terms, public.taxonomy_term_translations, public.product_taxonomy_terms
to authenticated;

create policy "taxonomy_terms: everyone reads"
  on public.taxonomy_terms for select to anon, authenticated
  using (true);
create policy "taxonomy_terms: admins insert"
  on public.taxonomy_terms for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "taxonomy_terms: admins update"
  on public.taxonomy_terms for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "taxonomy_terms: admins delete"
  on public.taxonomy_terms for delete to authenticated
  using ((select public.is_admin()));

create policy "taxonomy_term_translations: everyone reads"
  on public.taxonomy_term_translations for select to anon, authenticated
  using (true);
create policy "taxonomy_term_translations: admins insert"
  on public.taxonomy_term_translations for insert to authenticated
  with check ((select public.is_admin()));
create policy "taxonomy_term_translations: admins update"
  on public.taxonomy_term_translations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "taxonomy_term_translations: admins delete"
  on public.taxonomy_term_translations for delete to authenticated
  using ((select public.is_admin()));

-- a product's terms follow its visibility: the subquery runs under the products policy
create policy "product_taxonomy_terms: readable with their product"
  on public.product_taxonomy_terms for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "product_taxonomy_terms: admins insert"
  on public.product_taxonomy_terms for insert to authenticated
  with check ((select public.is_admin()));
create policy "product_taxonomy_terms: admins delete"
  on public.product_taxonomy_terms for delete to authenticated
  using ((select public.is_admin()));

-- Admin writes ---------------------------------------------------------------------------------------------
-- Security invoker like admin_save_product: RLS, the grants and the audit trigger apply to the caller.

-- Creates (p_id null) or renames a term. p_names is {"<locale>": "<name>", …}; the uk name is required (the
-- shop's main market, as for publishing a product), locales left out lose their name. Kind and slug are
-- fixed at creation. A name another term of the same list already has in that locale is refused (23505).
create function public.admin_save_taxonomy_term(p_id uuid, p_kind public.taxonomy_kind, p_slug text, p_names jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id   uuid := p_id;
  v_kind public.taxonomy_kind := p_kind;
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change the lists' using errcode = '42501';
  end if;
  if jsonb_typeof(p_names) is distinct from 'object' then
    raise exception 'names must be an object' using errcode = '22023';
  end if;
  if nullif(btrim(p_names ->> 'uk'), '') is null then
    raise exception 'a term needs its uk name' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.taxonomy_terms (kind, slug) values (p_kind, p_slug) returning id into v_id;
  else
    select kind into v_kind from public.taxonomy_terms where id = v_id;
    if not found then
      raise exception 'term % not found', v_id using errcode = 'P0002';
    end if;
    -- touches updated_at / updated_by
    update public.taxonomy_terms set position = position where id = v_id;
  end if;

  if exists (
    select 1
    from jsonb_each_text(p_names) as n (locale, name)
    join public.taxonomy_term_translations tr on tr.locale = n.locale and lower(tr.name) = lower(btrim(n.name))
    join public.taxonomy_terms t on t.id = tr.term_id
    where t.kind = v_kind and t.id <> v_id
  ) then
    raise exception 'another term has this name' using errcode = '23505';
  end if;

  delete from public.taxonomy_term_translations
  where term_id = v_id and not (p_names ? locale and nullif(btrim(p_names ->> locale), '') is not null);

  insert into public.taxonomy_term_translations (term_id, locale, name)
  select v_id, n.locale::public.locale, btrim(n.name)
  from jsonb_each_text(p_names) as n (locale, name)
  where btrim(n.name) <> ''
  on conflict (term_id, locale) do update set name = excluded.name, source = 'human';

  return v_id;
end;
$$;

-- 'deleted', 'in_use' (a product that is not deleted has the term) or 'not_found'. Security definer: "in use"
-- needs products.deleted_at, which the API roles cannot read; so the admin check (the caller's JWT) comes
-- first and is the only way in: inside a definer function current_user is the owner, so there is no
-- service-role branch and no service-role grant. The links of soft-deleted products go with the term.
create function public.admin_delete_taxonomy_term(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'only admins change the lists' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.product_taxonomy_terms pt
    join public.products p on p.id = pt.product_id
    where pt.term_id = p_id and p.deleted_at is null
  ) then
    return 'in_use';
  end if;
  delete from public.product_taxonomy_terms where term_id = p_id;
  delete from public.taxonomy_terms where id = p_id;
  return case when found then 'deleted' else 'not_found' end;
end;
$$;

-- admin_save_product (#17) and the product's terms in one transaction: the product form saves both at once.
create function public.admin_save_product_with_terms(p_id uuid, p_product jsonb, p_translations jsonb, p_term_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id    uuid;
  v_terms uuid[] := coalesce(p_term_ids, '{}');
begin
  v_id := public.admin_save_product(p_id, p_product, p_translations);
  delete from public.product_taxonomy_terms where product_id = v_id and not (term_id = any (v_terms));
  insert into public.product_taxonomy_terms (product_id, term_id)
  select v_id, term_id from unnest(v_terms) as term_id
  on conflict do nothing;
  return v_id;
end;
$$;

revoke all on function public.admin_save_taxonomy_term(uuid, public.taxonomy_kind, text, jsonb) from public, anon;
revoke all on function public.admin_delete_taxonomy_term(uuid) from public, anon;
revoke all on function public.admin_save_product_with_terms(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.admin_save_taxonomy_term(uuid, public.taxonomy_kind, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_taxonomy_term(uuid) to authenticated;
revoke all on function public.admin_delete_taxonomy_term(uuid) from service_role;
grant execute on function public.admin_save_product_with_terms(uuid, jsonb, jsonb, uuid[]) to authenticated, service_role;

-- Search and filters ---------------------------------------------------------------------------------------

-- typo tolerance: titles whose words are similar to the query (word similarity, trigrams)
create index product_translations_title_trgm_idx on public.product_translations
  using gin (title extensions.gin_trgm_ops);

-- The prefix query of the search terms: every term must match the start of a word ("корал" finds
-- "коралом", "earr" finds "earrings"). plainto_tsquery normalizes each term like the search vector (stemming
-- for en, de, fr …), so whatever a term contains it is a lexeme, never tsquery syntax. Null without terms or
-- when every term is a stop word.
create function private.prefix_tsquery(p_config regconfig, p_terms text[])
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select string_agg('(' || q::text || ':*)', ' & ')::tsquery
  from (select pg_catalog.plainto_tsquery(p_config, term) as q from unnest(p_terms) as term) as parts
  where pg_catalog.numnode(q) > 0;
$$;

-- The published products of the storefront that pass the category, search and price filters, with the
-- search rank and, per filter with counts, whether the product passes it: the listing keeps the products
-- that pass all three, the count of an option ignores its own filter. Validates every argument: the
-- functions below are called by anyone through the Data API.
--   p_terms          search words (the app splits the query, at most 8 words of at most 64 characters)
--   p_materials,
--   p_colours        term slugs; a product passes with any of them
--   p_price_*_minor  bounds of price_usd in US cents, both inclusive
--   p_availability   'in_stock' (a one-of-a-kind piece still available) and/or 'made_to_order'
create function private.shop_candidates(
  p_locale public.locale,
  p_category text,
  p_terms text[],
  p_materials text[],
  p_colours text[],
  p_price_min_minor bigint,
  p_price_max_minor bigint,
  p_availability text[]
)
returns table (
  product_id uuid,
  rank real,
  created_at timestamptz,
  price_usd numeric,
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
      case
        when p.fulfillment = 'made_to_order' then 'made_to_order'
        when p.availability = 'available' then 'in_stock'
      end as bucket,
      m.rank
    from public.products p
    join public.categories c on c.id = p.category_id
    left join matched m on m.product_id = p.id
    where p.status = 'published'
      and p.deleted_at is null
      and (p_category is null or c.slug = p_category)
      and (cardinality(v_terms) = 0 or m.product_id is not null)
      and (p_price_min_minor is null or p.price_usd >= p_price_min_minor / 100.0)
      and (p_price_max_minor is null or p.price_usd <= p_price_max_minor / 100.0)
      -- shown only with a translation in the locale or the fallback (as the storefront reads it)
      and exists (select 1 from public.product_translations t where t.product_id = p.id and t.locale in (p_locale, 'en'))
  )
  select p.id, p.rank, p.created_at, p.price_usd, p.bucket,
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
  from products p;
end;
$$;

revoke all on function private.prefix_tsquery(regconfig, text[]) from public;
revoke all on function private.shop_candidates(public.locale, text, text[], text[], text[], bigint, bigint, text[]) from public;

-- One page of the filtered listing: the product ids in order and the total. Security definer: it reads
-- products.deleted_at (not readable by the API roles) so the partial indexes of the catalog apply, and it
-- returns nothing but ids and counts of published products, which RLS shows to anyone anyway; the
-- storefront then reads the products themselves under RLS. p_sort: newest, price_asc, price_desc or
-- relevance (search only; newest without search terms).
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
  p_offset integer default 0
)
returns table (ids uuid[], total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_sort is null or p_sort not in ('newest', 'price_asc', 'price_desc', 'relevance') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid page' using errcode = '22023';
  end if;

  return query
  with listed as (
    select c.product_id, c.rank, c.created_at, c.price_usd
    from private.shop_candidates(p_locale, p_category, p_terms, p_materials, p_colours, p_price_min_minor,
      p_price_max_minor, p_availability) c
    where c.material_ok and c.colour_ok and c.availability_ok
  ),
  page as (
    select l.product_id, row_number() over (
      order by
        case when p_sort = 'relevance' then l.rank end desc nulls last,
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

-- The counts per option of the listing's filters (facet: material, colour, availability; value: the term
-- slug or the availability), each counting the products that pass every other filter. Options without
-- products are left out. Security definer for the reason above.
create function public.shop_facets(
  p_locale public.locale,
  p_category text default null,
  p_terms text[] default null,
  p_materials text[] default null,
  p_colours text[] default null,
  p_price_min_minor bigint default null,
  p_price_max_minor bigint default null,
  p_availability text[] default null
)
returns table (facet text, value text, count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select * from private.shop_candidates(p_locale, p_category, p_terms, p_materials, p_colours,
      p_price_min_minor, p_price_max_minor, p_availability)
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

revoke all on function public.shop_search(public.locale, text, text[], text[], text[], bigint, bigint, text[], text, integer, integer) from public;
revoke all on function public.shop_facets(public.locale, text, text[], text[], text[], bigint, bigint, text[]) from public;
grant execute on function public.shop_search(public.locale, text, text[], text[], text[], bigint, bigint, text[], text, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.shop_facets(public.locale, text, text[], text[], text[], bigint, bigint, text[])
  to anon, authenticated, service_role;
