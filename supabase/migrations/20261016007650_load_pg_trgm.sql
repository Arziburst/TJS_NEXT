-- Loads pg_trgm in the push session, so that 20261016007700's private.shop_candidates may set
-- pg_trgm.word_similarity_threshold on the hosted database: there the migration role is no superuser, and a
-- module's parameter is only a placeholder until the module is loaded in the session (production failed with
-- 42501 "permission denied to set parameter"). `supabase db push` applies the pending migrations over one
-- connection, so the module loaded here is still loaded when 20261016007700 runs.
select extensions.similarity('a', 'a');
