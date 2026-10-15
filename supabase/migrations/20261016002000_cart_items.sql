-- The signed-in shopper's cart: one row per product (and, from task #66, per variant). A guest's cart lives
-- in a first-party cookie and is merged into these rows after sign-in. Prices and availability are never
-- stored here: the cart reads them from the catalog on every render. Each shopper reads and writes only
-- their own rows.

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  -- reserved for product variants (task #66); no variants table exists yet
  variant_id uuid,
  -- the app enforces the shop's limits (one of a kind: 1; made to order: up to a maximum); this is a sanity bound
  quantity   integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_line_unique unique nulls not distinct (user_id, product_id, variant_id)
);

create index cart_items_product_id_idx on public.cart_items (product_id);

create function private.set_cart_item_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger cart_items_timestamps
  before insert or update on public.cart_items
  for each row execute function private.set_cart_item_timestamps();

alter table public.cart_items enable row level security;

revoke all on table public.cart_items from anon, authenticated;
grant select, insert, update, delete on table public.cart_items to authenticated;

create policy "cart_items: owner reads"
  on public.cart_items for select to authenticated
  using (user_id = (select auth.uid()));
-- A line can only name a product the shopper can see (the subquery runs under the products policy): a draft,
-- archived or deleted product cannot be put into a cart through the API.
create policy "cart_items: owner inserts visible products"
  on public.cart_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id)
  );
create policy "cart_items: owner updates visible products"
  on public.cart_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id)
  );
create policy "cart_items: owner deletes"
  on public.cart_items for delete to authenticated
  using (user_id = (select auth.uid()));
