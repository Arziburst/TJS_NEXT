-- Smoke test of the local stack: pgTAP runs and the schemas and roles the Data API relies on exist.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_schema('public', 'schema public exists');
select has_schema('extensions', 'schema extensions exists');
select has_role('anon', 'role anon exists');
select has_role('authenticated', 'role authenticated exists');

select * from finish();
rollback;
