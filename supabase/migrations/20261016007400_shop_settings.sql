-- Shop settings (#21): the shop's name and how customers reach it (D19: shown in the footer, the order
-- confirmation and the emails), and the Telegram chat the owner's notifications go to (D11). One row.
-- Everyone reads the public columns (column grants); the chat id is readable only by the service role, which
-- the server uses after its own admin check. Only an admin writes. Every channel is optional: the storefront
-- shows only the ones that are set.

create table public.shop_settings (
  id               smallint primary key default 1 check (id = 1),
  shop_name        text check (btrim(shop_name) <> '' and char_length(shop_name) <= 100),
  -- the account name without "@"; the profile URL is derived from it
  instagram_handle text check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  email            text check (char_length(email) <= 254 and email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'),
  -- as the owner writes it (spaces, brackets); the tel: link keeps only "+" and the digits
  phone            text check (phone ~ '^\+?[0-9][0-9 ()-]{5,22}[0-9]$'),
  -- chat links in the form the server normalizes them to (src/lib/settings/contacts.ts)
  telegram_url     text check (telegram_url ~ '^https://t\.me/(\+[A-Za-z0-9_-]{1,64}|[A-Za-z][A-Za-z0-9_]{4,31})$'),
  viber_url        text check (
    viber_url ~ '^viber://chat\?number=%2B[0-9]{7,15}$' or viber_url ~ '^https://invite\.viber\.com/\?g2=[A-Za-z0-9_-]{1,100}$'
  ),
  whatsapp_url     text check (
    whatsapp_url ~ '^https://wa\.me/[0-9]{7,15}$' or whatsapp_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'
  ),
  -- a user, group or channel id of the Bot API (groups are negative)
  telegram_chat_id text check (telegram_chat_id ~ '^-?[0-9]{1,20}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null
);

create index shop_settings_created_by_idx on public.shop_settings (created_by);
create index shop_settings_updated_by_idx on public.shop_settings (updated_by);

create trigger shop_settings_audit
  before insert or update on public.shop_settings
  for each row execute function private.set_audit_columns();

-- the one row; it is never inserted or deleted through the API
insert into public.shop_settings default values;

alter table public.shop_settings enable row level security;

revoke all on table public.shop_settings from anon, authenticated;
grant select (
  id, shop_name, instagram_handle, email, phone, telegram_url, viber_url, whatsapp_url, updated_at
) on table public.shop_settings to anon, authenticated;
grant update (
  shop_name, instagram_handle, email, phone, telegram_url, viber_url, whatsapp_url, telegram_chat_id
) on table public.shop_settings to authenticated;

create policy "shop settings are readable by everyone"
  on public.shop_settings for select to anon, authenticated
  using (true);

create policy "admins update shop settings"
  on public.shop_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

-- Price conversion (D28) --------------------------------------------------------------------------------------
-- The admin settings page saves the markup (one value for every display currency, D28) and each currency's
-- charm rounding rule in one transaction. Security invoker: the currency_settings policies and grants decide;
-- the explicit check only gives a clear refusal. p_rules: [{currency, round_increment, ending,
-- small_price_below, small_round_increment, small_ending}], amounts in minor units.

create function public.admin_save_price_settings(p_markup_bps integer, p_rules jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rule  record;
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change the price settings' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rules) is distinct from 'array' then
    raise exception 'rules must be an array' using errcode = '22023';
  end if;

  update public.currency_settings set markup_bps = p_markup_bps where currency is not null;

  for v_rule in
    select * from jsonb_to_recordset(p_rules) as r (
      currency text, round_increment integer, ending integer, small_price_below integer,
      small_round_increment integer, small_ending integer
    )
  loop
    update public.currency_settings set
      round_increment       = v_rule.round_increment,
      ending                = v_rule.ending,
      small_price_below     = v_rule.small_price_below,
      small_round_increment = v_rule.small_round_increment,
      small_ending          = v_rule.small_ending
    where currency = v_rule.currency;
    if not found then
      raise exception 'currency % not found', v_rule.currency using errcode = 'P0002';
    end if;
  end loop;
end;
$$;

revoke all on function public.admin_save_price_settings(integer, jsonb) from public, anon;
grant execute on function public.admin_save_price_settings(integer, jsonb) to authenticated, service_role;
