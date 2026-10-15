-- The MongoDB ObjectId of a product imported from the legacy shop (scripts/import/), so the importer finds the
-- rows it created and can run again without duplicating them. Internal: the column grants of the Data API
-- roles (20261016001412) list the storefront columns only, so anon and authenticated cannot read it.

alter table public.products
  add column legacy_id text unique check (legacy_id ~ '^[0-9a-f]{24}$');
