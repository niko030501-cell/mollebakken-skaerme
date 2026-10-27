-- ==================================================================
-- Piktogram (Del 4): faste valg, Ja/Nej/Mere-billeder, valg på beboerens iPad og noter.
--
-- Sådan hænger et valg sammen, i almindeligt sprog:
--   1. Personalet starter et valg i admin (eller beboeren åbner et fast valg fra Nu-kortet).
--      Det lægges som ÉN række i piktogram_aktivt_valg (højst ét valg ad gangen pr. beboer).
--   2. Beboerens iPad spørger hvert par sekunder, om der er et valg i gang, og viser det i fuld skærm.
--   3. Når beboeren trykker på et billede, gemmes hvilket i rækken (fremhævningen bliver stående).
--   4. Personalet trykker "Valgte", "Intet svar" eller "Svarede på anden måde".
--      Det gemmes i piktogram_valg_registreringer, og valget lukkes på iPad'en.
-- Alt er pr. beboer (beboer_id). Kræver de tre tidligere piktogram-filer.
-- ==================================================================

create table if not exists public.piktogram_aktivt_valg (
  beboer_id        uuid primary key references public.beboere(id) on delete cascade,
  fast_valg_id     uuid references public.piktogram_faste_valg(id) on delete set null,
  fast_valg_navn   text,
  spoergsmaal      text not null,
  piktogram_ids    uuid[] not null check (cardinality(piktogram_ids) between 2 and 4),
  valgt_id         uuid,
  valgt_tidspunkt  bigint,
  startet          bigint not null
);
alter table public.piktogram_aktivt_valg enable row level security;
revoke all on public.piktogram_aktivt_valg from anon, authenticated, public;

-- Intern: det aktive valg som JSON (billeder i den rækkefølge de blev valgt), eller null.
create or replace function public._pik_aktivt_json(p_beboer uuid)
returns jsonb
language sql security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'fast_valg_id', a.fast_valg_id, 'fast_valg_navn', a.fast_valg_navn,
           'spoergsmaal', a.spoergsmaal, 'valgt_id', a.valgt_id, 'startet', a.startet,
           'billeder', (select jsonb_agg(jsonb_build_object('id', p.id, 'navn', p.navn, 'sti', p.billede_path,
                          'farve', (select farve from piktogram_kategorier k where k.id = p.kategori_id))
                          order by o.n)
                          from unnest(a.piktogram_ids) with ordinality o(id, n)
                          join piktogram_piktogrammer p on p.id = o.id))
    from piktogram_aktivt_valg a where a.beboer_id = p_beboer;
$$;

-- Når et billede slettes: ryd det også fra faste valg. Et fast valg med under 2 billeder
-- slettes (og dets koblinger), og et aktivt valg der bruger billedet lukkes.
create or replace function public._pik_fjern_brug(p_beboer_id uuid, p_ider uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  ny uuid[];
begin
  if coalesce(array_length(p_ider, 1), 0) = 0 then return; end if;
  delete from piktogram_aktivitet_kobling where beboer_id = p_beboer_id and piktogram_id = any(p_ider);
  for v in select id, piktogram_ids from piktogram_faste_valg
            where beboer_id = p_beboer_id and slettet is null and piktogram_ids && p_ider loop
    select coalesce(array_agg(x order by n), '{}') into ny
      from unnest(v.piktogram_ids) with ordinality t(x, n) where x <> all(p_ider);
    if cardinality(ny) < 2 then
      update piktogram_faste_valg set slettet = now() where id = v.id;
      delete from piktogram_aktivitet_kobling where beboer_id = p_beboer_id and fast_valg_id = v.id;
    else
      update piktogram_faste_valg set piktogram_ids = ny where id = v.id;
    end if;
  end loop;
  delete from piktogram_aktivt_valg where beboer_id = p_beboer_id and piktogram_ids && p_ider;
  update piktogram_beboer_indstillinger set
     ja_piktogram_id   = case when ja_piktogram_id   = any(p_ider) then null else ja_piktogram_id end,
     nej_piktogram_id  = case when nej_piktogram_id  = any(p_ider) then null else nej_piktogram_id end,
     mere_piktogram_id = case when mere_piktogram_id = any(p_ider) then null else mere_piktogram_id end
   where beboer_id = p_beboer_id;
end;
$$;

-- ---------- Beboerens iPad (token fra beboer_login) ----------

create or replace function public.beboer_pik_aktivt(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return _pik_aktivt_json(_beboer_fra_token(p_token));
end;
$$;

-- Beboeren åbner et fast valg (fx fra Nu-kortet). Findes der allerede et valg, returneres det.
create or replace function public.beboer_pik_valg_aabn(p_token text, p_fast_valg_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
  v piktogram_faste_valg%rowtype;
  ider uuid[];
begin
  if exists (select 1 from piktogram_aktivt_valg where beboer_id = v_beboer) then
    return _pik_aktivt_json(v_beboer);
  end if;
  select * into v from piktogram_faste_valg where id = p_fast_valg_id and beboer_id = v_beboer and slettet is null;
  if v.id is null then raise exception 'valget findes ikke'; end if;
  select coalesce(array_agg(o.id order by o.n), '{}') into ider
    from unnest(v.piktogram_ids) with ordinality o(id, n)
    join piktogram_piktogrammer p on p.id = o.id and p.slettet is null and p.billede_path is not null;
  if cardinality(ider) < 2 then raise exception 'valget har for få billeder'; end if;
  insert into piktogram_aktivt_valg (beboer_id, fast_valg_id, fast_valg_navn, spoergsmaal, piktogram_ids, startet)
  values (v_beboer, v.id, v.navn, v.sporgsmaal, ider, (extract(epoch from now()) * 1000)::bigint);
  return _pik_aktivt_json(v_beboer);
end;
$$;

-- Beboeren trykker på ét billede i valget. Fremhævningen bliver stående, til personalet lukker.
create or replace function public.beboer_pik_valg_tryk(p_token text, p_piktogram_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  update piktogram_aktivt_valg
     set valgt_id = p_piktogram_id, valgt_tidspunkt = (extract(epoch from now()) * 1000)::bigint
   where beboer_id = v_beboer and p_piktogram_id = any(piktogram_ids);
  return _pik_aktivt_json(v_beboer);
end;
$$;

-- Nødudgang på iPad'en (langt tryk, kun for personale): lukker valget uden at gemme en registrering.
create or replace function public.beboer_pik_valg_luk(p_token text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from piktogram_aktivt_valg where beboer_id = _beboer_fra_token(p_token);
end;
$$;

-- ---------- Admin (personale-token) ----------

-- Faste valg: opret (p_id null) eller ret. 2-4 billeder.
create or replace function public.personale_pik_valg_gem(
  p_token text, p_beboer_id uuid, p_id uuid, p_navn text, p_sporgsmaal text, p_piktogram_ids uuid[])
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
begin
  perform _personale_tjek_token(p_token);
  if btrim(coalesce(p_navn, '')) = '' or length(p_navn) > 60 then raise exception 'ugyldigt navn'; end if;
  if btrim(coalesce(p_sporgsmaal, '')) = '' or length(p_sporgsmaal) > 120 then raise exception 'ugyldigt spørgsmål'; end if;
  if cardinality(p_piktogram_ids) not between 2 and 4
     or cardinality(p_piktogram_ids) <> (select count(distinct x) from unnest(p_piktogram_ids) x) then
    raise exception 'vælg 2-4 forskellige billeder';
  end if;
  if (select count(*) from piktogram_piktogrammer
       where id = any(p_piktogram_ids) and beboer_id = p_beboer_id and slettet is null) <> cardinality(p_piktogram_ids) then
    raise exception 'billederne findes ikke';
  end if;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into piktogram_faste_valg (id, navn, sporgsmaal, piktogram_ids, raekkefolge, beboer_id)
    values (v_id, btrim(p_navn), btrim(p_sporgsmaal), p_piktogram_ids,
            coalesce((select max(raekkefolge) + 1 from piktogram_faste_valg where beboer_id = p_beboer_id and slettet is null), 0),
            p_beboer_id);
  else
    update piktogram_faste_valg set navn = btrim(p_navn), sporgsmaal = btrim(p_sporgsmaal), piktogram_ids = p_piktogram_ids
     where id = v_id and beboer_id = p_beboer_id and slettet is null;
    if not found then raise exception 'valget findes ikke'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.personale_pik_valg_slet(p_token text, p_beboer_id uuid, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  delete from piktogram_aktivitet_kobling where beboer_id = p_beboer_id and fast_valg_id = p_id;
  update piktogram_faste_valg set slettet = now() where id = p_id and beboer_id = p_beboer_id;
end;
$$;

-- Ja / Nej / Mere: vælg egne billeder (null = standardsymbol i appen).
create or replace function public.personale_pik_jnm_saet(
  p_token text, p_beboer_id uuid, p_ja uuid, p_nej uuid, p_mere uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  x uuid;
begin
  perform _personale_tjek_token(p_token);
  foreach x in array array[p_ja, p_nej, p_mere] loop
    if x is not null and not exists (select 1 from piktogram_piktogrammer
         where id = x and beboer_id = p_beboer_id and slettet is null and billede_path is not null) then
      raise exception 'billedet findes ikke';
    end if;
  end loop;
  insert into piktogram_beboer_indstillinger (beboer_id, ja_piktogram_id, nej_piktogram_id, mere_piktogram_id)
  values (p_beboer_id, p_ja, p_nej, p_mere)
  on conflict (beboer_id) do update
    set ja_piktogram_id = excluded.ja_piktogram_id, nej_piktogram_id = excluded.nej_piktogram_id,
        mere_piktogram_id = excluded.mere_piktogram_id;
end;
$$;

-- Ja/Nej/Mere-billeder og det valg der er i gang (admin henter dette tit, mens et valg er åbent).
create or replace function public.personale_pik_valg_hent(p_token text, p_beboer_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return jsonb_build_object(
    'ja_nej_mere', (select jsonb_build_object('ja', ja_piktogram_id, 'nej', nej_piktogram_id, 'mere', mere_piktogram_id)
                      from piktogram_beboer_indstillinger where beboer_id = p_beboer_id),
    'aktivt', _pik_aktivt_json(p_beboer_id));
end;
$$;

-- Start et valg på beboerens iPad: enten et fast valg, eller et hurtigt valg med 2-4 billeder.
create or replace function public.personale_pik_valg_start(
  p_token text, p_beboer_id uuid, p_fast_valg_id uuid, p_piktogram_ids uuid[], p_spoergsmaal text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v piktogram_faste_valg%rowtype;
  ider uuid[];
  sp text;
  navn text;
begin
  perform _personale_tjek_token(p_token);
  if p_fast_valg_id is not null then
    select * into v from piktogram_faste_valg where id = p_fast_valg_id and beboer_id = p_beboer_id and slettet is null;
    if v.id is null then raise exception 'valget findes ikke'; end if;
    ider := v.piktogram_ids; sp := v.sporgsmaal; navn := v.navn;
  else
    ider := p_piktogram_ids; sp := btrim(coalesce(p_spoergsmaal, '')); navn := null;
    if sp = '' then sp := 'Hvad vil du?'; end if;
    if length(sp) > 120 then raise exception 'spørgsmålet er for langt'; end if;
  end if;
  if cardinality(ider) not between 2 and 4 then raise exception 'vælg 2-4 billeder'; end if;
  if (select count(*) from piktogram_piktogrammer
       where id = any(ider) and beboer_id = p_beboer_id and slettet is null and billede_path is not null) <> cardinality(ider) then
    raise exception 'et billede mangler billedfil';
  end if;
  insert into piktogram_aktivt_valg (beboer_id, fast_valg_id, fast_valg_navn, spoergsmaal, piktogram_ids, startet)
  values (p_beboer_id, p_fast_valg_id, navn, sp, ider, (extract(epoch from now()) * 1000)::bigint)
  on conflict (beboer_id) do update
    set fast_valg_id = excluded.fast_valg_id, fast_valg_navn = excluded.fast_valg_navn,
        spoergsmaal = excluded.spoergsmaal, piktogram_ids = excluded.piktogram_ids,
        valgt_id = null, valgt_tidspunkt = null, startet = excluded.startet;
  return _pik_aktivt_json(p_beboer_id);
end;
$$;

-- Personalet noterer svaret med ét tryk og lukker valget.
--   valgte         -> beboeren valgte et billede (p_valgt_id, ellers det beboeren trykkede på)
--   ingen-respons  -> intet svar
--   andet          -> svarede på anden måde
-- Ingen af dem er en fejl: alle former for svar er kommunikation.
create or replace function public.personale_pik_valg_afslut(
  p_token text, p_beboer_id uuid, p_type text, p_valgt_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  a piktogram_aktivt_valg%rowtype;
  v_ord text;
  v_svar jsonb;
begin
  perform _personale_tjek_token(p_token);
  if p_type not in ('valgte', 'ingen-respons', 'andet') then raise exception 'ugyldig type'; end if;
  select * into a from piktogram_aktivt_valg where beboer_id = p_beboer_id;
  if a.beboer_id is null then raise exception 'der er intet valg i gang'; end if;

  v_svar := jsonb_build_object('type', p_type);
  if p_type = 'valgte' then
    if coalesce(p_valgt_id, a.valgt_id) is null or coalesce(p_valgt_id, a.valgt_id) <> all(a.piktogram_ids) then
      raise exception 'vælg hvilket billede der blev valgt';
    end if;
    select navn into v_ord from piktogram_piktogrammer where id = coalesce(p_valgt_id, a.valgt_id);
    v_svar := v_svar || jsonb_build_object('ord', v_ord);
  end if;

  insert into piktogram_valg_registreringer (id, tidspunkt, tilbudt, fast_valg_navn, svar, beboer_id, type)
  values (gen_random_uuid(), (extract(epoch from now()) * 1000)::bigint,
          coalesce((select array_agg(p.navn order by o.n)
                      from unnest(a.piktogram_ids) with ordinality o(id, n)
                      join piktogram_piktogrammer p on p.id = o.id), '{}'),
          a.fast_valg_navn, v_svar, p_beboer_id, p_type);
  delete from piktogram_aktivt_valg where beboer_id = p_beboer_id;
end;
$$;

-- Luk et valg uden at gemme noget (fx startet ved en fejl).
create or replace function public.personale_pik_valg_annuller(p_token text, p_beboer_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  delete from piktogram_aktivt_valg where beboer_id = p_beboer_id;
end;
$$;

-- Noter: de seneste registreringer, nyeste først (Ja/Nej/Mere-tryk og valg).
create or replace function public.personale_pik_noter(p_token text, p_beboer_id uuid, p_antal integer default 100)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tidspunkt', tidspunkt, 'type', coalesce(type, svar->>'type'),
             'tilbudt', to_jsonb(tilbudt), 'fast_valg_navn', fast_valg_navn, 'ord', svar->>'ord') order by tidspunkt desc)
      from (select * from piktogram_valg_registreringer
             where beboer_id = p_beboer_id order by tidspunkt desc limit least(greatest(coalesce(p_antal, 100), 1), 500)) r
  ), '[]'::jsonb);
end;
$$;

revoke execute on function
  public._pik_aktivt_json(uuid),
  public.beboer_pik_aktivt(text), public.beboer_pik_valg_aabn(text, uuid),
  public.beboer_pik_valg_tryk(text, uuid), public.beboer_pik_valg_luk(text),
  public.personale_pik_valg_gem(text, uuid, uuid, text, text, uuid[]),
  public.personale_pik_valg_slet(text, uuid, uuid),
  public.personale_pik_jnm_saet(text, uuid, uuid, uuid, uuid),
  public.personale_pik_valg_hent(text, uuid),
  public.personale_pik_valg_start(text, uuid, uuid, uuid[], text),
  public.personale_pik_valg_afslut(text, uuid, text, uuid),
  public.personale_pik_valg_annuller(text, uuid),
  public.personale_pik_noter(text, uuid, integer)
  from public;
grant execute on function
  public.beboer_pik_aktivt(text), public.beboer_pik_valg_aabn(text, uuid),
  public.beboer_pik_valg_tryk(text, uuid), public.beboer_pik_valg_luk(text),
  public.personale_pik_valg_gem(text, uuid, uuid, text, text, uuid[]),
  public.personale_pik_valg_slet(text, uuid, uuid),
  public.personale_pik_jnm_saet(text, uuid, uuid, uuid, uuid),
  public.personale_pik_valg_hent(text, uuid),
  public.personale_pik_valg_start(text, uuid, uuid, uuid[], text),
  public.personale_pik_valg_afslut(text, uuid, text, uuid),
  public.personale_pik_valg_annuller(text, uuid),
  public.personale_pik_noter(text, uuid, integer)
  to anon, authenticated;
-- _pik_aktivt_json og _pik_fjern_brug er interne og får ingen grant.
