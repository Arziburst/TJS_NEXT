-- The customer account (#28): first and last name on the profile, and the customer's saved delivery details.
--
-- profiles.first_name / last_name  what the account page edits and the checkout prefills (the order keeps the
--              same two fields). `name` stays the display name (the account menu, the sign-up's "Name and
--              surname"): the account page writes it as "first last". Profiles that never had first or last name
--              set (a sign-up, a Google account) are split from `name` by the app until the customer saves them.
-- saved_addresses  up to SAVED_ADDRESSES_MAX (src/lib/account/addresses.ts, 5) delivery destinations per
--              customer, one of them the default; each is a checkout delivery choice (src/lib/checkout/schema.ts
--              deliverySchema) as the order stores it. Each customer reads and writes only their own rows.

alter table public.profiles
  add column first_name text check (first_name is null or (btrim(first_name) <> '' and char_length(first_name) <= 100)),
  add column last_name  text check (last_name is null or (btrim(last_name) <> '' and char_length(last_name) <= 100));

grant update (first_name, last_name) on table public.profiles to authenticated;

create table public.saved_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- the customer's own name for it ("Home", "Office"); optional
  label       text check (label is null or (btrim(label) <> '' and char_length(label) <= 50)),
  -- D2: Ukraine (Nova Poshta) or an EU member state / Switzerland (Nova Post), never the UK
  country     text not null check (country ~ '^[A-Z]{2}$' and country <> 'GB'),
  -- the checkout's delivery choice: { "kind": "novaPoshtaWarehouse" | "novaPoshtaAddress" | "novaPostDivision"
  -- | "novaPostAddress", … }; its full shape is checked by the app (deliverySchema) on every save and use
  delivery    jsonb not null check (
                jsonb_typeof(delivery) = 'object'
                and delivery ->> 'kind' in ('novaPoshtaWarehouse', 'novaPoshtaAddress', 'novaPostDivision', 'novaPostAddress')
              ),
  is_default  boolean not null default false,
  created_at  timestamptz not null default clock_timestamp(),
  updated_at  timestamptz not null default now(),
  constraint saved_addresses_carrier_of_country
    check ((country = 'UA') = (delivery ->> 'kind' in ('novaPoshtaWarehouse', 'novaPoshtaAddress'))),
  constraint saved_addresses_country_of_choice
    check (country = 'UA' or delivery ->> 'country' = country)
);

create index saved_addresses_user_created_idx on public.saved_addresses (user_id, created_at);
-- one default per customer
create unique index saved_addresses_one_default_idx on public.saved_addresses (user_id) where is_default;

-- Before a row is written: the limit per customer, the first address becomes the default, and a new default
-- takes the mark from the previous one (before this row is stored, so the one-default index never sees two).
create function private.saved_addresses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- one customer's inserts queue here, so two concurrent ones cannot both pass the count
    perform pg_advisory_xact_lock(hashtextextended('saved_addresses:' || new.user_id::text, 0));
    -- SAVED_ADDRESSES_MAX (src/lib/account/addresses.ts)
    if (select count(*) from public.saved_addresses a where a.user_id = new.user_id) >= 5 then
      raise exception 'saved address limit reached' using errcode = 'TJ429';
    end if;
    if not exists (select 1 from public.saved_addresses a where a.user_id = new.user_id and a.is_default) then
      new.is_default := true;
    end if;
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  if new.is_default then
    update public.saved_addresses a
       set is_default = false
     where a.user_id = new.user_id and a.id <> new.id and a.is_default;
  end if;
  return new;
end;
$$;

create trigger saved_addresses_before_write
  before insert or update on public.saved_addresses
  for each row execute function private.saved_addresses_before_write();

-- After the default is deleted, the oldest remaining address becomes the default.
create function private.saved_addresses_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_default then
    update public.saved_addresses a
       set is_default = true
     where a.id = (
       select b.id from public.saved_addresses b
        where b.user_id = old.user_id
        order by b.created_at, b.id
        limit 1
     );
  end if;
  return null;
end;
$$;

create trigger saved_addresses_after_delete
  after delete on public.saved_addresses
  for each row execute function private.saved_addresses_after_delete();

alter table public.saved_addresses enable row level security;

revoke all on table public.saved_addresses from anon, authenticated;
-- user_id comes from its default (the caller); the destination itself is never edited (delete and add again)
grant select, delete on table public.saved_addresses to authenticated;
grant insert (label, country, delivery, is_default) on table public.saved_addresses to authenticated;
grant update (label, is_default) on table public.saved_addresses to authenticated;

create policy "saved_addresses: owner reads"
  on public.saved_addresses for select to authenticated
  using (user_id = (select auth.uid()));
create policy "saved_addresses: owner inserts"
  on public.saved_addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "saved_addresses: owner updates"
  on public.saved_addresses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "saved_addresses: owner deletes"
  on public.saved_addresses for delete to authenticated
  using (user_id = (select auth.uid()));
