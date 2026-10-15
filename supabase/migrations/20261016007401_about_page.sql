-- The About page (#21): the owner's story, one text per locale, written in the admin. The texts are rich text
-- limited to headings, paragraphs, links and lists, sanitized on the server before they are stored (the
-- database cannot parse HTML; src/lib/settings/rich-text.ts). Publishing needs the Ukrainian text; the other
-- locales fall back to en, then uk. Everyone reads the page once it is published; only an admin writes.

create table public.about_page (
  id           smallint primary key default 1 check (id = 1),
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null
);

create index about_page_created_by_idx on public.about_page (created_by);
create index about_page_updated_by_idx on public.about_page (updated_by);

create trigger about_page_audit
  before insert or update on public.about_page
  for each row execute function private.set_audit_columns();

-- the one row, unpublished: the page shows a TBD note until the owner writes and publishes her text
insert into public.about_page default values;

create table public.about_translations (
  locale           public.locale primary key,
  body_html        text not null check (btrim(body_html) <> '' and char_length(body_html) <= 50000),
  meta_description text check (btrim(meta_description) <> '' and char_length(meta_description) <= 500),
  -- a machine translation (#19) is shown but not indexed until a person has reviewed it
  source           public.translation_source not null default 'human',
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null
);

create index about_translations_created_by_idx on public.about_translations (created_by);
create index about_translations_updated_by_idx on public.about_translations (updated_by);

create trigger about_translations_audit
  before insert or update on public.about_translations
  for each row execute function private.set_audit_columns();

alter table public.about_page enable row level security;
alter table public.about_translations enable row level security;

-- who wrote a text is internal; the admin screen reads it through the service role if ever needed
revoke all on table public.about_page, public.about_translations from anon, authenticated;
grant select (id, published, updated_at) on table public.about_page to anon, authenticated;
grant update (published) on table public.about_page to authenticated;
grant select (locale, body_html, meta_description, source, reviewed_at, updated_at)
  on table public.about_translations to anon, authenticated;
grant insert (locale, body_html, meta_description, source, reviewed_at),
      update (body_html, meta_description, source, reviewed_at),
      delete
  on table public.about_translations to authenticated;

create policy "the about page state is readable by everyone"
  on public.about_page for select to anon, authenticated
  using (true);

create policy "admins update the about page"
  on public.about_page for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

-- an unpublished draft is the admin's alone
create policy "about texts are readable once published"
  on public.about_translations for select to anon, authenticated
  using (exists (select 1 from public.about_page where published) or (select public.is_admin()));

create policy "admins insert about texts"
  on public.about_translations for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy "admins update about texts"
  on public.about_translations for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

create policy "admins delete about texts"
  on public.about_translations for delete to authenticated
  using ((select public.is_admin()));

-- Saves the texts and the published state in one transaction. Security invoker: RLS, the grants and the audit
-- trigger apply as for any other write. p_translations: [{locale, body_html, meta_description}] — every locale
-- with a text; a locale left out loses its text. A text saved here is written by a person (source human).
create function public.admin_save_about(p_published boolean, p_translations jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_locales text[];
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change the about page' using errcode = '42501';
  end if;
  if jsonb_typeof(p_translations) is distinct from 'array' then
    raise exception 'translations must be an array' using errcode = '22023';
  end if;
  select coalesce(array_agg(t ->> 'locale'), '{}') into v_locales from jsonb_array_elements(p_translations) t;
  if p_published and not ('uk' = any (v_locales)) then
    raise exception 'the published about page needs its uk text' using errcode = '23514';
  end if;

  delete from public.about_translations where not (locale = any (v_locales));

  insert into public.about_translations (locale, body_html, meta_description, source, reviewed_at)
  select t.locale, t.body_html, t.meta_description, 'human', null
  from jsonb_to_recordset(p_translations) as t (locale public.locale, body_html text, meta_description text)
  on conflict (locale) do update set
    body_html        = excluded.body_html,
    meta_description = excluded.meta_description,
    source           = excluded.source,
    reviewed_at      = excluded.reviewed_at;

  update public.about_page set published = p_published where id = 1;
end;
$$;

revoke all on function public.admin_save_about(boolean, jsonb) from public, anon;
grant execute on function public.admin_save_about(boolean, jsonb) to authenticated, service_role;
