-- The signed-in shopper's favorites: one row per product. A guest's favorites live in a first-party cookie and
-- are merged into these rows after sign-in. Prices and availability are never stored here: the favorites page
-- reads them from the catalog on every render. Each shopper reads and writes only their own rows.

create table public.favorites (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  -- clock_timestamp: rows written in one statement (a merge) keep the order they were sent in, newest last
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, product_id)
);

create index favorites_product_id_idx on public.favorites (product_id);

alter table public.favorites enable row level security;

-- nothing to update: a favorite is added or removed
revoke all on table public.favorites from anon, authenticated;
grant select, insert, delete on table public.favorites to authenticated;

create policy "favorites: owner reads"
  on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
-- A favorite can only name a product the shopper can see (the subquery runs under the products policy): a
-- draft, archived or deleted product cannot be added through the API.
create policy "favorites: owner inserts visible products"
  on public.favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id)
  );
create policy "favorites: owner deletes"
  on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));
