-- ============================================================================
-- Audit B3 — kg_gen_code() is an internal helper (random code generator); it
-- should not be part of the public PostgREST RPC surface. Tolerant revoke loop
-- (same pattern as 0032) so it succeeds whatever the exact signature.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'kg_gen_code'
  loop
    execute format('revoke execute on function %s from anon, authenticated', r.sig);
  end loop;
end $$;
