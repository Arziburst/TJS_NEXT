-- Auth: profiles get the customer's name and phone, editable by the customer only on their own row. The role
-- stays out of reach of every API role (D12): only name and phone carry an UPDATE grant, so an update of
-- role fails with a privilege error before any policy runs.

alter table public.profiles
  add column name       text check (name is null or (btrim(name) <> '' and char_length(name) <= 100)),
  add column phone      text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column updated_at timestamptz not null default now();

create function private.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_profiles_updated_at();

grant update (name, phone) on table public.profiles to authenticated;

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- A new user's profile takes name and phone from the sign-up metadata (email sign-up: name, phone; Google:
-- full_name or name). The metadata is user input: a value that breaks a column rule is dropped, never the
-- sign-up, and nothing in it can set the role.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  name  text := nullif(btrim(coalesce(meta ->> 'name', meta ->> 'full_name', '')), '');
  phone text := nullif(btrim(coalesce(meta ->> 'phone', '')), '');
begin
  if name is not null and char_length(name) > 100 then
    name := null;
  end if;
  if phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$' then
    phone := null;
  end if;
  insert into public.profiles (id, name, phone) values (new.id, name, phone);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
