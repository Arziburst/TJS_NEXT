-- Catalog schema: profiles with roles, categories, products with per-locale content and images.
-- The public reads categories and published, available, not deleted products; only admins write. The
-- admin role is granted only in the database (D12): no API role can update a profile.

create schema if not exists private;
revoke all on schema private from public;

-- Locales of D3 (the same list as src/i18n/routing.ts; tests/catalog/locales.test.ts keeps them equal).
create domain public.locale as text
  check (value in ('uk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'cs', 'pt', 'ro'));

create type public.user_role as enum ('customer', 'admin');
create type public.translation_source as enum ('human', 'machine');
create type public.product_status as enum ('draft', 'published', 'archived');

-- Audit columns: updated_at always; created_by / updated_by from the JWT, so a client cannot attribute a
-- row to someone else. Without a JWT (service role, seed) the given values are kept.
create function private.set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_by := coalesce((select auth.uid()), new.updated_by);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Profiles ------------------------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Security definer: reads profiles without going through their RLS, so policies can call it.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Categories ----------------------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

create index categories_position_idx on public.categories (position);
create index categories_created_by_idx on public.categories (created_by);
create index categories_updated_by_idx on public.categories (updated_by);

create trigger categories_audit
  before insert or update on public.categories
  for each row execute function private.set_audit_columns();

create table public.category_translations (
  category_id uuid not null references public.categories (id) on delete cascade,
  locale      public.locale not null,
  name        text not null check (btrim(name) <> ''),
  source      public.translation_source not null default 'human',
  primary key (category_id, locale)
);

alter table public.categories enable row level security;
alter table public.category_translations enable row level security;

-- Products ------------------------------------------------------------------------------------------
-- status is the publication workflow; deleted_at is a soft delete (the row stays for order history and
-- can be restored). Every piece is handmade: a made_to_order product can be ordered again and again (it
-- takes lead_time_days, set by the admin); a one_of_a_kind piece exists once and goes
-- available -> reserved -> sold, staying visible as sold.

create type public.product_fulfillment as enum ('made_to_order', 'one_of_a_kind');
create type public.product_availability as enum ('available', 'reserved', 'sold');

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references public.categories (id) on delete restrict,
  sku            text unique check (btrim(sku) <> ''),
  status         public.product_status not null default 'draft',
  fulfillment    public.product_fulfillment not null default 'made_to_order',
  availability   public.product_availability not null default 'available',
  lead_time_days integer check (lead_time_days > 0),
  price_usd      numeric(10, 2) not null check (price_usd >= 0),
  weight_g       numeric not null default 0 check (weight_g >= 0),
  hs_code        text not null default '7117' check (hs_code ~ '^[0-9]{4,10}$'),
  materials      text,
  care           text,
  position       integer not null default 0,
  published_at   timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  -- Only a one-of-a-kind piece can be reserved or sold; only made-to-order work has a lead time.
  constraint products_made_to_order_always_available
    check (fulfillment = 'one_of_a_kind' or availability = 'available'),
  constraint products_lead_time_only_made_to_order
    check (lead_time_days is null or fulfillment = 'made_to_order')
);

create index products_listing_idx on public.products (category_id, status, created_at desc) where deleted_at is null;
create index products_status_created_idx on public.products (status, created_at desc) where deleted_at is null;
create index products_price_idx on public.products (price_usd) where deleted_at is null;
create index products_position_idx on public.products (position);
create index products_created_by_idx on public.products (created_by);
create index products_updated_by_idx on public.products (updated_by);

create trigger products_audit
  before insert or update on public.products
  for each row execute function private.set_audit_columns();

-- published_at records the first publication.
create function private.set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger products_published_at
  before insert or update of status on public.products
  for each row execute function private.set_published_at();

-- Availability transitions of a one-of-a-kind piece, for the order flow (not exposed through the API).
-- Each is one conditional UPDATE: of two concurrent orders for the same piece exactly one gets true.
create function private.reserve_one_of_a_kind(p_product_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.products set availability = 'reserved'
    where id = p_product_id and fulfillment = 'one_of_a_kind' and availability = 'available'
      and status = 'published' and deleted_at is null
    returning 1
  )
  select exists (select 1 from changed);
$$;

create function private.release_one_of_a_kind(p_product_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.products set availability = 'available'
    where id = p_product_id and fulfillment = 'one_of_a_kind' and availability = 'reserved'
    returning 1
  )
  select exists (select 1 from changed);
$$;

-- Sold when the order is accepted: from reserved, or straight from available.
create function private.mark_one_of_a_kind_sold(p_product_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.products set availability = 'sold'
    where id = p_product_id and fulfillment = 'one_of_a_kind' and availability in ('available', 'reserved')
    returning 1
  )
  select exists (select 1 from changed);
$$;

revoke all on function private.reserve_one_of_a_kind(uuid) from public;
revoke all on function private.release_one_of_a_kind(uuid) from public;
revoke all on function private.mark_one_of_a_kind_sold(uuid) from public;

-- Text search configuration per locale; locales without a Postgres stemmer use 'simple'.
create function private.search_config(loc public.locale)
returns regconfig
language sql
immutable
set search_path = ''
as $$
  select case loc
    when 'en' then 'pg_catalog.english'
    when 'de' then 'pg_catalog.german'
    when 'fr' then 'pg_catalog.french'
    when 'es' then 'pg_catalog.spanish'
    when 'it' then 'pg_catalog.italian'
    when 'nl' then 'pg_catalog.dutch'
    when 'pt' then 'pg_catalog.portuguese'
    when 'ro' then 'pg_catalog.romanian'
    else 'pg_catalog.simple'
  end::regconfig;
$$;

create table public.product_translations (
  product_id       uuid not null references public.products (id) on delete cascade,
  locale           public.locale not null,
  slug             text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null check (btrim(title) <> ''),
  description      text,
  alt_text         text,
  meta_title       text,
  meta_description text,
  source           public.translation_source not null default 'human',
  reviewed_at      timestamptz,
  search_vector    tsvector generated always as (
    setweight(to_tsvector(private.search_config(locale), title), 'A')
    || setweight(to_tsvector(private.search_config(locale), coalesce(description, '')), 'B')
  ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  primary key (product_id, locale),
  unique (locale, slug)
);

create index product_translations_search_idx on public.product_translations using gin (search_vector);
create index product_translations_created_by_idx on public.product_translations (created_by);
create index product_translations_updated_by_idx on public.product_translations (updated_by);

create trigger product_translations_audit
  before insert or update on public.product_translations
  for each row execute function private.set_audit_columns();

create table public.product_images (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  storage_path   text not null unique check (btrim(storage_path) <> ''),
  position       integer not null default 0,
  width          integer not null check (width > 0),
  height         integer not null check (height > 0),
  blur_data_url  text check (blur_data_url like 'data:image/%' and length(blur_data_url) <= 4096),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null
);

create index product_images_product_position_idx on public.product_images (product_id, position);
create index product_images_created_by_idx on public.product_images (created_by);
create index product_images_updated_by_idx on public.product_images (updated_by);

create trigger product_images_audit
  before insert or update on public.product_images
  for each row execute function private.set_audit_columns();

create table public.product_image_alts (
  image_id uuid not null references public.product_images (id) on delete cascade,
  locale   public.locale not null,
  alt      text not null check (btrim(alt) <> ''),
  primary key (image_id, locale)
);

alter table public.products enable row level security;
alter table public.product_translations enable row level security;
alter table public.product_images enable row level security;
alter table public.product_image_alts enable row level security;

-- Privileges ----------------------------------------------------------------------------------------
-- Explicit grants instead of the Data API defaults: anon only reads, authenticated may attempt writes
-- that RLS then limits to admins, and nobody but the database owner and service_role touches roles.

revoke all on table
  public.profiles, public.categories, public.category_translations, public.products,
  public.product_translations, public.product_images, public.product_image_alts
from anon, authenticated;

grant select on table public.profiles to authenticated;

grant select on table
  public.categories, public.category_translations, public.products,
  public.product_translations, public.product_images, public.product_image_alts
to anon, authenticated;

grant insert, update, delete on table
  public.categories, public.category_translations, public.products,
  public.product_translations, public.product_images, public.product_image_alts
to authenticated;

-- Policies ------------------------------------------------------------------------------------------
-- Insert and update checks also pin the attribution columns to the caller (the audit trigger sets them).

create policy "profiles: read own, admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "categories: everyone reads"
  on public.categories for select to anon, authenticated
  using (true);
create policy "categories: admins insert"
  on public.categories for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "categories: admins update"
  on public.categories for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "categories: admins delete"
  on public.categories for delete to authenticated
  using ((select public.is_admin()));

create policy "category_translations: everyone reads"
  on public.category_translations for select to anon, authenticated
  using (true);
create policy "category_translations: admins insert"
  on public.category_translations for insert to authenticated
  with check ((select public.is_admin()));
create policy "category_translations: admins update"
  on public.category_translations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "category_translations: admins delete"
  on public.category_translations for delete to authenticated
  using ((select public.is_admin()));

-- Published pieces stay readable whatever their availability (a sold one-of-a-kind is shown as sold).
create policy "products: everyone reads published ones, admins read all"
  on public.products for select to anon, authenticated
  using ((status = 'published' and deleted_at is null) or (select public.is_admin()));
create policy "products: admins insert"
  on public.products for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "products: admins update"
  on public.products for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "products: admins delete"
  on public.products for delete to authenticated
  using ((select public.is_admin()));

-- The child tables follow the visibility of their product: the subquery runs under the products policy.
create policy "product_translations: readable with their product"
  on public.product_translations for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "product_translations: admins insert"
  on public.product_translations for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "product_translations: admins update"
  on public.product_translations for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "product_translations: admins delete"
  on public.product_translations for delete to authenticated
  using ((select public.is_admin()));

create policy "product_images: readable with their product"
  on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "product_images: admins insert"
  on public.product_images for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "product_images: admins update"
  on public.product_images for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy "product_images: admins delete"
  on public.product_images for delete to authenticated
  using ((select public.is_admin()));

create policy "product_image_alts: readable with their image"
  on public.product_image_alts for select to anon, authenticated
  using (exists (select 1 from public.product_images i where i.id = image_id));
create policy "product_image_alts: admins insert"
  on public.product_image_alts for insert to authenticated
  with check ((select public.is_admin()));
create policy "product_image_alts: admins update"
  on public.product_image_alts for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "product_image_alts: admins delete"
  on public.product_image_alts for delete to authenticated
  using ((select public.is_admin()));
