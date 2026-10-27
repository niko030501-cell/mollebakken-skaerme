-- ==================================================================
-- Piktogram-admin (Del 3): hvem er med beboeren i dag.
--
-- Personalet vælger sig selv fra dagens vagtplan (personaleskaerm_vagter) og et tidsrum.
-- Navn og foto KOPIERES ind i piktogram_med_beboer, så ingen skal tage billeder.
-- Alt i tabellen slettes automatisk efter midnat (cron 'ryd-pik-med-beboer', fra Del 1).
--
-- Udvider også personale_pik_hent, så admin får dagens vagter, dagens "med beboeren"
-- og hele ugeplanen i ét kald. Kræver piktogram-leyla-schema.sql og piktogram-admin-schema.sql.
-- ==================================================================

create or replace function public.personale_pik_hent(p_token text, p_beboer_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text;
  v_idag date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  perform _personale_tjek_token(p_token);
  select navn into v_navn from beboere where id = p_beboer_id;
  return jsonb_build_object(
    'beboer_navn', v_navn,
    'idag', v_idag,
    'kategorier', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'farve', farve) order by raekkefolge, navn)
        from piktogram_kategorier where beboer_id = p_beboer_id and slettet is null), '[]'::jsonb),
    'piktogrammer', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'kategori_id', kategori_id,
               'sti', billede_path, 'vises', vises_for_beboer) order by raekkefolge, navn)
        from piktogram_piktogrammer where beboer_id = p_beboer_id and slettet is null), '[]'::jsonb),
    'aktiviteter', coalesce((
      select jsonb_agg(jsonb_build_object('aktivitet', u.aktivitet, 'antal', u.antal,
               'piktogram_id', k.piktogram_id, 'fast_valg_id', k.fast_valg_id) order by u.foerste, u.aktivitet)
        from (select aktivitet, count(*) antal,
                     min((split_part(tid, ':', 1)::int * 60) + split_part(tid, ':', 2)::int) foerste
                from ugeplaner where beboer = v_navn group by aktivitet) u
        left join piktogram_aktivitet_kobling k on k.beboer_id = p_beboer_id and k.aktivitet = u.aktivitet), '[]'::jsonb),
    'ugeplan', coalesce((
      select jsonb_agg(jsonb_build_object('ugedag', ugedag, 'tid', tid, 'aktivitet', aktivitet))
        from ugeplaner where beboer = v_navn), '[]'::jsonb),
    'faste_valg', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'sporgsmaal', sporgsmaal, 'piktogram_ids', piktogram_ids)
               order by raekkefolge, navn)
        from piktogram_faste_valg where beboer_id = p_beboer_id and slettet is null), '[]'::jsonb),
    -- Dagens vagtplan (til "Vælg dig"). Præfikser som "Nat: " fjernes fra navnet.
    'vagter_idag', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id,
               'navn', regexp_replace(navn, '^[^:]+:\s*', ''),
               'rolle', rolle, 'billede', billede,
               'start', to_char(start at time zone 'Europe/Copenhagen', 'HH24:MI'),
               'slut', to_char(slut at time zone 'Europe/Copenhagen', 'HH24:MI'),
               'slut_naeste_dag', (slut at time zone 'Europe/Copenhagen')::date > v_idag)
             order by start)
        from personaleskaerm_vagter where dag = v_idag), '[]'::jsonb),
    'med_idag', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'billede', billede,
               'start', to_char(start_tid, 'HH24:MI'), 'slut', to_char(slut_tid, 'HH24:MI'))
               order by start_tid)
        from piktogram_med_beboer where beboer_id = p_beboer_id and dato = v_idag), '[]'::jsonb)
  );
end;
$$;

-- Opret (p_id null) eller ret tidsrummet for en medarbejder, der er med beboeren i dag.
-- Ved oprettelse hentes navn og foto fra vagtplanen (kun dagens vagter). Tider som 'HH:MM'.
create or replace function public.personale_pik_med_gem(
  p_token text, p_beboer_id uuid, p_id uuid, p_vagt_id uuid, p_start text, p_slut text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_idag date := (now() at time zone 'Europe/Copenhagen')::date;
  v_start time;
  v_slut time;
  v_id uuid := p_id;
  v_navn text;
  v_billede text;
begin
  perform _personale_tjek_token(p_token);
  if p_start !~ '^[0-2][0-9]:[0-5][0-9]$' or p_slut !~ '^[0-2][0-9]:[0-5][0-9]$' then
    raise exception 'ugyldigt tidspunkt';
  end if;
  v_start := p_start::time;
  v_slut := p_slut::time;
  if v_slut <= v_start then raise exception 'sluttid skal være efter starttid'; end if;
  if exists (select 1 from piktogram_med_beboer
              where beboer_id = p_beboer_id and dato = v_idag and id is distinct from p_id
                and start_tid < v_slut and slut_tid > v_start) then
    raise exception 'tidsrummet overlapper med en anden medarbejder';
  end if;

  if v_id is null then
    select regexp_replace(navn, '^[^:]+:\s*', ''), billede into v_navn, v_billede
      from personaleskaerm_vagter where id = p_vagt_id and dag = v_idag;
    if v_navn is null then raise exception 'vagten findes ikke i dagens vagtplan'; end if;
    insert into piktogram_med_beboer (beboer_id, dato, vagt_id, navn, billede, start_tid, slut_tid)
    values (p_beboer_id, v_idag, p_vagt_id, v_navn, v_billede, v_start, v_slut)
    returning id into v_id;
  else
    update piktogram_med_beboer set start_tid = v_start, slut_tid = v_slut
     where id = v_id and beboer_id = p_beboer_id and dato = v_idag;
    if not found then raise exception 'findes ikke'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.personale_pik_med_slet(p_token text, p_beboer_id uuid, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  delete from piktogram_med_beboer where id = p_id and beboer_id = p_beboer_id;
end;
$$;

revoke execute on function
  public.personale_pik_med_gem(text, uuid, uuid, uuid, text, text),
  public.personale_pik_med_slet(text, uuid, uuid)
  from public;
grant execute on function
  public.personale_pik_med_gem(text, uuid, uuid, uuid, text, text),
  public.personale_pik_med_slet(text, uuid, uuid)
  to anon, authenticated;
