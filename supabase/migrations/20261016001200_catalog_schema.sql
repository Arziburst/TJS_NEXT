-- Catalog schema: profiles with roles, categories, products with per-locale content and images.
-- Everyone reads categories and available products; only admins write. The admin role is granted
-- only in the database (D12): no API role can update a profile.

create schema if not exists private;
revoke all on schema private from public;

-- Locales of D3.
create domain public.locale as text
  check (value in ('uk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'cs', 'pt', 'ro'));

create type public.user_role as enum ('customer', 'admin');
create type public.translation_source as enum ('human', 'machine');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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
  created_at timestamptz not null default now()
);

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

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  price_usd   numeric(10, 2) not null check (price_usd >= 0),
  weight_g    numeric not null default 0 check (weight_g >= 0),
  available   boolean not null default true,
  hs_code     text not null default '7117' check (hs_code ~ '^[0-9]{4,10}$'),
  materials   text,
  care        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index products_category_created_idx on public.products (category_id, created_at desc);
create index products_created_idx on public.products (created_at desc);
create index products_price_idx on public.products (price_usd);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

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
  updated_at       timestamptz not null default now(),
  primary key (product_id, locale),
  unique (locale, slug)
);

create trigger product_translations_set_updated_at
  before update on public.product_translations
  for each row execute function private.set_updated_at();

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  storage_path text not null unique check (btrim(storage_path) <> ''),
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index product_images_product_position_idx on public.product_images (product_id, position);

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

create policy "profiles: read own, admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "categories: everyone reads"
  on public.categories for select to anon, authenticated
  using (true);
create policy "categories: admins insert"
  on public.categories for insert to authenticated
  with check ((select public.is_admin()));
create policy "categories: admins update"
  on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
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

create policy "products: everyone reads available, admins read all"
  on public.products for select to anon, authenticated
  using (available or (select public.is_admin()));
create policy "products: admins insert"
  on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy "products: admins update"
  on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "products: admins delete"
  on public.products for delete to authenticated
  using ((select public.is_admin()));

-- The child tables follow the visibility of their product: the subquery runs under the products policy.
create policy "product_translations: readable with their product"
  on public.product_translations for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "product_translations: admins insert"
  on public.product_translations for insert to authenticated
  with check ((select public.is_admin()));
create policy "product_translations: admins update"
  on public.product_translations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "product_translations: admins delete"
  on public.product_translations for delete to authenticated
  using ((select public.is_admin()));

create policy "product_images: readable with their product"
  on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "product_images: admins insert"
  on public.product_images for insert to authenticated
  with check ((select public.is_admin()));
create policy "product_images: admins update"
  on public.product_images for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
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
