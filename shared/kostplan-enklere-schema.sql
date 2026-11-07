-- ====================================================================
-- Kostplan: en regel har nu en LISTE af ugedage (eller en bestemt dato)
--
-- Bygger oven på shared/kostplan-schema.sql. Kan køres flere gange.
--
-- Migrering af eksisterende regler (ingen rækker slettes, ingen afkrydsninger røres):
--   * hver_dag  -> hvornaar_type 'ugedag' med alle syv dage i ugedage
--   * ugedag    -> ugedage = {den ene dag}
--   * dato      -> uændret
--   * Regler samles IKKE automatisk til én (ved tvivl lades de være). Kenneths regler
--     adskiller sig i måltid, så der var intet at samle.
--   * Kolonnen ugedag (enkelt dag) beholdes urørt, men bruges ikke længere.
--   * Reglernes id'er er uændrede, så kost_afkrydsning og point er uændrede.
-- ====================================================================

alter table public.kost_regler add column if not exists ugedage text[];

-- Den gamle kontrol (type 'ugedag' <=> ugedag udfyldt) passer ikke til den nye model
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.kost_regler'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%ugedag IS NOT NULL%'
  loop
    execute format('alter table public.kost_regler drop constraint %I', r.conname);
  end loop;
end $$;

update public.kost_regler
   set ugedage = array['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag']
 where hvornaar_type = 'hver_dag' and ugedage is null;

update public.kost_regler
   set ugedage = array[ugedag]
 where hvornaar_type = 'ugedag' and ugedage is null and ugedag is not null;

update public.kost_regler set hvornaar_type = 'ugedag' where hvornaar_type = 'hver_dag';

alter table public.kost_regler drop constraint if exists kost_regler_ugedage_check;
alter table public.kost_regler
  add constraint kost_regler_ugedage_check
  check ((hvornaar_type = 'ugedag') = (ugedage is not null)
         and (ugedage is null or (cardinality(ugedage) between 1 and 7
              and ugedage <@ array['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag']::text[])));

-- Gælder reglen på dagen p_d? (liste af ugedage)
create or replace function public._kost_gaelder(
  p_type text, p_ugedage text[], p_dato date, p_fra date, p_til date, p_d date)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_fra <= p_d
     and (p_til is null or p_d < p_til)
     and ((p_type = 'dato' and p_dato = p_d)
          or (p_type in ('ugedag', 'hver_dag') and public._kost_ugedag(p_d) = any (p_ugedage)));
$$;

create or replace function public._kost_laengste_stime(p_beboer uuid)
returns integer
language sql stable security definer
set search_path = public, pg_temp
as $$
  with fra as (
    select min(dato) as d from kost_afkrydsning where borger_id = p_beboer
  ),
  dage as (
    select g::date as d
      from fra, generate_series(fra.d, current_date + 1, interval '1 day') g
     where fra.d is not null
  ),
  krav as (
    select dage.d,
           count(r.id) as antal,
           count(a.id) as fulgt_antal
      from dage
      join kost_regler r
        on r.borger_id = p_beboer
       and public._kost_gaelder(r.hvornaar_type, r.ugedage, r.dato, r.gyldig_fra, r.gyldig_til, dage.d)
      left join kost_afkrydsning a
        on a.regel_id = r.id and a.dato = dage.d and a.fulgt
     group by dage.d
  ),
  markeret as (
    select d, (antal = fulgt_antal) as ok,
           count(*) filter (where antal <> fulgt_antal) over (order by d) as gruppe
      from krav
  )
  select coalesce(max(n), 0)::int
    from (select count(*) as n from markeret where ok group by gruppe) x;
$$;

create or replace function public._kost_regel_json(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id, 'borger_id', r.borger_id, 'maaltid_id', r.maaltid_id,
    'hvornaar_type', r.hvornaar_type, 'ugedage', to_jsonb(r.ugedage), 'dato', r.dato,
    'sortering', r.sortering, 'gyldig_fra', r.gyldig_fra, 'gyldig_til', r.gyldig_til,
    'opdateret_af', r.opdateret_af, 'opdateret_tidspunkt', r.opdateret_tidspunkt,
    'maaltid', jsonb_build_object('id', m.id, 'navn', m.navn, 'ikon', m.ikon,
                                  'billede_sti', m.billede_sti, 'sortering', m.sortering),
    'punkter', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'navn', p.navn, 'maengde', p.maengde,
                                          'ikon', p.ikon, 'billede_sti', p.billede_sti)
                       order by p.sortering)
        from kost_punkter p where p.regel_id = r.id), '[]'::jsonb))
  from kost_regler r join kost_maaltider m on m.id = r.maaltid_id
  where r.id = p_id;
$$;

create or replace function public.beboer_kost_afkryds(
  p_token text, p_regel_id uuid, p_dato date, p_fulgt boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
  r kost_regler%rowtype;
begin
  if p_dato is null or p_fulgt is null or abs(p_dato - current_date) > 1 then
    raise exception 'Ugyldig dato';
  end if;
  select * into r from kost_regler where id = p_regel_id and borger_id = v_beboer;
  if r.id is null
     or not _kost_gaelder(r.hvornaar_type, r.ugedage, r.dato, r.gyldig_fra, r.gyldig_til, p_dato) then
    raise exception 'Ugyldigt måltid';
  end if;
  insert into kost_afkrydsning (borger_id, regel_id, dato, fulgt)
    values (v_beboer, p_regel_id, p_dato, p_fulgt)
  on conflict (regel_id, dato) do update set fulgt = excluded.fulgt;
end;
$$;

-- Opret/ret regel: p_dato udfyldt = bestemt dato, ellers p_ugedage (1-7 dage)
create or replace function public.personale_kost_gem_regel(
  p_token text, p_regel_id uuid, p_borger_id uuid, p_maaltid_id uuid,
  p_ugedage text[], p_dato date, p_punkter jsonb, p_navn text, p_lokal_dato date)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_fra date;
  v_navn text := btrim(coalesce(p_navn, ''));
  v_alle text[] := array['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'];
  v_dage text[];
  v_type text;
begin
  perform _personale_tjek_token(p_token);
  if length(v_navn) = 0 then raise exception 'Medarbejdernavn mangler'; end if;
  if p_lokal_dato is null then raise exception 'Dato mangler'; end if;
  if not exists (select 1 from beboere where id = p_borger_id) then raise exception 'Ukendt borger'; end if;
  if not exists (select 1 from kost_maaltider where id = p_maaltid_id) then raise exception 'Ukendt måltid'; end if;
  if p_dato is not null then
    v_type := 'dato';
    v_dage := null;
  else
    v_type := 'ugedag';
    -- behold kun gyldige dage, i ugens rækkefølge, uden dubletter
    select coalesce(array_agg(d order by array_position(v_alle, d)), '{}') into v_dage
      from (select distinct d from unnest(coalesce(p_ugedage, '{}')) d where d = any (v_alle)) x;
    if cardinality(v_dage) = 0 then raise exception 'Vælg mindst én dag'; end if;
  end if;
  if p_punkter is null or jsonb_typeof(p_punkter) <> 'array' or jsonb_array_length(p_punkter) > 30 then
    raise exception 'Punkterne er ugyldige';
  end if;
  if exists (select 1 from jsonb_array_elements(p_punkter) e
              where length(btrim(coalesce(e ->> 'navn', ''))) not between 1 and 60) then
    raise exception 'Alle punkter skal have et navn';
  end if;

  v_fra := case when v_type = 'dato' then least(p_lokal_dato, p_dato) else p_lokal_dato end;

  if p_regel_id is null then
    insert into kost_regler (borger_id, maaltid_id, hvornaar_type, ugedage, dato,
                             gyldig_fra, opdateret_af, opdateret_tidspunkt)
      values (p_borger_id, p_maaltid_id, v_type, v_dage, case when v_type = 'dato' then p_dato end,
              v_fra, v_navn, now())
      returning id into v_id;
  else
    update kost_regler
       set borger_id = p_borger_id, maaltid_id = p_maaltid_id, hvornaar_type = v_type,
           ugedage = v_dage, ugedag = null,
           dato = case when v_type = 'dato' then p_dato end,
           gyldig_fra = least(gyldig_fra, v_fra),
           opdateret_af = v_navn, opdateret_tidspunkt = now()
     where id = p_regel_id and gyldig_til is null
     returning id into v_id;
    if v_id is null then raise exception 'Reglen findes ikke'; end if;
    delete from kost_punkter where regel_id = v_id;
  end if;

  insert into kost_punkter (regel_id, navn, maengde, ikon, billede_sti, sortering)
  select v_id, btrim(e.value ->> 'navn'),
         nullif(btrim(coalesce(e.value ->> 'maengde', '')), ''),
         case when nullif(btrim(coalesce(e.value ->> 'billede_sti', '')), '') is null
              then nullif(btrim(coalesce(e.value ->> 'ikon', '')), '') end,
         nullif(btrim(coalesce(e.value ->> 'billede_sti', '')), ''),
         (e.ordinality - 1)::int
    from jsonb_array_elements(p_punkter) with ordinality as e(value, ordinality);

  return v_id;
end;
$$;

create or replace function public.personale_kost_kopier_regel(
  p_token text, p_regel_id uuid, p_til_borger uuid, p_navn text, p_lokal_dato date)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ny uuid;
  v_navn text := btrim(coalesce(p_navn, ''));
begin
  perform _personale_tjek_token(p_token);
  if length(v_navn) = 0 then raise exception 'Medarbejdernavn mangler'; end if;
  if p_lokal_dato is null then raise exception 'Dato mangler'; end if;
  if not exists (select 1 from beboere where id = p_til_borger) then raise exception 'Ukendt borger'; end if;
  insert into kost_regler (borger_id, maaltid_id, hvornaar_type, ugedage, dato, gyldig_fra, opdateret_af)
    select p_til_borger, maaltid_id, hvornaar_type, ugedage, dato,
           case when hvornaar_type = 'dato' then least(p_lokal_dato, dato) else p_lokal_dato end, v_navn
      from kost_regler where id = p_regel_id and gyldig_til is null
    returning id into v_ny;
  if v_ny is null then raise exception 'Reglen findes ikke'; end if;
  insert into kost_punkter (regel_id, navn, maengde, ikon, billede_sti, sortering)
    select v_ny, navn, maengde, ikon, billede_sti, sortering from kost_punkter where regel_id = p_regel_id;
  return v_ny;
end;
$$;

-- De gamle funktioner med enkelt ugedag udgår (de ville ikke længere virke)
drop function if exists public.personale_kost_gem_regel(text, uuid, uuid, uuid, text, text, date, jsonb, text, date);
drop function if exists public._kost_gaelder(text, text, date, date, date, date);

revoke execute on function
  public._kost_gaelder(text, text[], date, date, date, date),
  public._kost_laengste_stime(uuid), public._kost_regel_json(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.beboer_kost_afkryds(text, uuid, date, boolean),
  public.personale_kost_gem_regel(text, uuid, uuid, uuid, text[], date, jsonb, text, date),
  public.personale_kost_kopier_regel(text, uuid, uuid, text, date)
  from public;
grant execute on function
  public.beboer_kost_afkryds(text, uuid, date, boolean),
  public.personale_kost_gem_regel(text, uuid, uuid, uuid, text[], date, jsonb, text, date),
  public.personale_kost_kopier_regel(text, uuid, uuid, text, date)
  to anon, authenticated;
