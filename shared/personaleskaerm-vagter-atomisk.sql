-- ============================================================
-- Atomisk udskiftning af personaleskaerm_vagter (kaldes af workfeed-sync
-- Edge Function'en hvert 15. min via supabase.rpc).
--
-- Før: DELETE og INSERT var to separate API-kald → tabellen stod tom i op
-- til ~7 sek. En skærm der hentede i hullet (personaleskaerm-v2 henter hvert
-- 60. sek.) viste intet personale i et helt minut — set i loggen bl.a.
-- 27/9 kl. 09:00:12 og 05:00:11 dansk tid.
--
-- Nu i ÉN transaktion: læsere ser enten de gamle eller de nye rækker, aldrig
-- en tom tabel. Samme data som før — ingen ændring i hvilke vagter der skrives.
-- Allerede kørt i Supabase (migration erstat_personaleskaerm_vagter).
-- ============================================================

create or replace function public.erstat_personaleskaerm_vagter(p_vagter jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  antal integer;
begin
  delete from personaleskaerm_vagter where true;
  insert into personaleskaerm_vagter (navn, rolle, start, slut, billede, dag, tag)
  select navn, rolle, start, slut, billede, dag, tag
  from jsonb_to_recordset(coalesce(p_vagter, '[]'::jsonb))
    as x(navn text, rolle text, start timestamptz, slut timestamptz, billede text, dag date, tag text);
  get diagnostics antal = row_count;
  return antal;
end;
$$;

-- Kun sync'en (service_role) må kalde den — anon/authenticated kunne ellers
-- tømme vagttabellen via API'et. Verificeret med et rigtigt anon-kald (401).
revoke all on function public.erstat_personaleskaerm_vagter(jsonb) from public, anon, authenticated;
grant execute on function public.erstat_personaleskaerm_vagter(jsonb) to service_role;
