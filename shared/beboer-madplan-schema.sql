-- ====================================================================
-- beboer-v2 / Madplan — fase 1: læsefunktion til beboerappen
--
-- Sikkerhedsmodel (samme som resten af beboer_*-funktionerne)
--   * Kræver gyldig beboer-token (_beboer_fra_token kaster 28000 ellers).
--   * Kun læsning: der skrives ikke til nogen tabel, og policies på
--     `madplan` røres ikke. Personalet udfylder madplanen som hidtil.
--   * Uge og dag bestemmes af enheden (lokal tid); serveren bruger ikke
--     sin egen dato.
--
-- Data: madplan(id, dag text, ret text, uge_start date = mandag).
--   * Én ret pr. dag og uge. dag er 'Mandag' … 'Søndag'.
--   * Tomme retter ('' eller kun mellemrum) udelades, så appen blot
--     tjekker om dagen findes i svaret.
--
-- Kør i Supabase SQL Editor. Kan køres igen uden skade.
-- ====================================================================

create or replace function public.beboer_madplan(p_token text, p_uge_start date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  if p_uge_start is null then
    raise exception 'Ugedato mangler';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('dag', dag, 'ret', btrim(ret)))
      from madplan
     where uge_start = p_uge_start
       and btrim(coalesce(ret, '')) <> ''), '[]'::jsonb);
end;
$$;

revoke execute on function public.beboer_madplan(text, date) from public;
grant  execute on function public.beboer_madplan(text, date) to anon, authenticated;
