-- ==================================================================
-- Piktogram: personalet sætter selv 2-4 billeder op mod hinanden på beboerens iPad.
--
-- Bruges af leyla-v2 (knappen "Sæt valg op", som personalet holder nede).
-- Kan kun bruge beboerens EGNE billeder og kun starte et valg for beboeren selv.
-- Erstatter et eventuelt valg, der allerede er i gang. Personalet noterer svaret
-- bagefter i admin (Valgte / Intet svar / Svarede på anden måde).
-- Kræver piktogram-valg-schema.sql.
-- ==================================================================

create or replace function public.beboer_pik_valg_start(p_token text, p_piktogram_ids uuid[], p_spoergsmaal text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
  sp text := btrim(coalesce(p_spoergsmaal, ''));
begin
  if sp = '' then sp := 'Hvad vil du?'; end if;
  if length(sp) > 120 then raise exception 'spørgsmålet er for langt'; end if;
  if cardinality(p_piktogram_ids) not between 2 and 4
     or cardinality(p_piktogram_ids) <> (select count(distinct x) from unnest(p_piktogram_ids) x) then
    raise exception 'vælg 2-4 forskellige billeder';
  end if;
  if (select count(*) from piktogram_piktogrammer
       where id = any(p_piktogram_ids) and beboer_id = v_beboer and slettet is null and billede_path is not null)
     <> cardinality(p_piktogram_ids) then
    raise exception 'et billede findes ikke';
  end if;
  insert into piktogram_aktivt_valg (beboer_id, fast_valg_id, fast_valg_navn, spoergsmaal, piktogram_ids, startet)
  values (v_beboer, null, null, sp, p_piktogram_ids, (extract(epoch from now()) * 1000)::bigint)
  on conflict (beboer_id) do update
    set fast_valg_id = null, fast_valg_navn = null, spoergsmaal = excluded.spoergsmaal,
        piktogram_ids = excluded.piktogram_ids, valgt_id = null, valgt_tidspunkt = null, startet = excluded.startet;
  return _pik_aktivt_json(v_beboer);
end;
$$;

revoke execute on function public.beboer_pik_valg_start(text, uuid[], text) from public;
grant execute on function public.beboer_pik_valg_start(text, uuid[], text) to anon, authenticated;
