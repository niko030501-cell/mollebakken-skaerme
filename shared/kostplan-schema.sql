-- ====================================================================
-- Kostplan, point og medaljer (beboer-v2 + mollebakken-app-v2)
--
-- Sikkerhedsmodel (samme som Træning, se beboer-traening-schema.sql)
--   * Alle tabeller har RLS slået til, INGEN policies og ingen rettigheder til
--     anon/authenticated. De kan kun nås via SECURITY DEFINER-funktionerne her.
--   * Beboer-funktionerne udleder borgeren FRA TOKEN (_beboer_fra_token), aldrig
--     fra en parameter. En borger kan derfor kun læse og skrive sin egen plan
--     og sine egne afkrydsninger.
--   * Personale-funktionerne kræver personale-token (_personale_tjek_token).
--   * Billeder ligger i en PRIVAT bucket (kost-billeder) uden policies. Upload og
--     signerede læse-URL'er udleveres kun af edge-funktionen `kost-billede`
--     (shared/kost-billede-edge-function.ts), som tjekker token først.
--
-- Point, dage i træk og medaljer GEMMES IKKE. De regnes ud fra kost_afkrydsning
-- (i appen) — kun _kost_laengste_stime() findes i databasen, til at låse det
-- hemmelige tema op på serveren.
--
-- Regler og historik
--   * En regel slettes aldrig, hvis der er afkrydsninger på den: den får i stedet
--     gyldig_til, så point og medaljer bliver stående.
--   * gyldig_fra / gyldig_til sættes med enhedens LOKALE dato (p_lokal_dato).
--
-- Kan køres flere gange. Ændrer/sletter ingen eksisterende data (tilføjer kun
-- 'legende' som gyldigt tema).
-- ====================================================================

-- ---------- Tabeller ----------

create table if not exists public.kost_maaltider (
  id           uuid primary key default gen_random_uuid(),
  navn         text not null check (length(btrim(navn)) between 1 and 40),
  ikon         text check (ikon is null or ikon ~ '^[a-z0-9_]{1,30}$'),
  billede_sti  text check (billede_sti is null or billede_sti ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  sortering    integer not null default 0,
  oprettet_at  timestamptz not null default now()
);
create unique index if not exists kost_maaltider_navn_uq on public.kost_maaltider ((lower(btrim(navn))));

create table if not exists public.kost_regler (
  id                   uuid primary key default gen_random_uuid(),
  borger_id            uuid not null references public.beboere(id) on delete cascade,
  maaltid_id           uuid not null references public.kost_maaltider(id) on delete restrict,
  hvornaar_type        text not null check (hvornaar_type in ('hver_dag','ugedag','dato')),
  ugedag               text check (ugedag in ('Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag')),
  dato                 date,
  sortering            integer not null default 0,
  gyldig_fra           date not null,
  gyldig_til           date,
  opdateret_af         text not null check (length(btrim(opdateret_af)) > 0),
  opdateret_tidspunkt  timestamptz not null default now(),
  check ((hvornaar_type = 'ugedag') = (ugedag is not null)),
  check ((hvornaar_type = 'dato') = (dato is not null))
);
create index if not exists kost_regler_borger_idx on public.kost_regler (borger_id);

create table if not exists public.kost_punkter (
  id           uuid primary key default gen_random_uuid(),
  regel_id     uuid not null references public.kost_regler(id) on delete cascade,
  navn         text not null check (length(btrim(navn)) between 1 and 60),
  maengde      text check (maengde is null or length(maengde) <= 40),
  ikon         text check (ikon is null or ikon ~ '^[a-z0-9_]{1,30}$'),
  billede_sti  text check (billede_sti is null or billede_sti ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  sortering    integer not null default 0
);
create index if not exists kost_punkter_regel_idx on public.kost_punkter (regel_id, sortering);

create table if not exists public.kost_afkrydsning (
  id         uuid primary key default gen_random_uuid(),
  borger_id  uuid not null references public.beboere(id) on delete cascade,
  regel_id   uuid not null references public.kost_regler(id) on delete cascade,
  dato       date not null,
  fulgt      boolean not null default true,
  unique (regel_id, dato)
);
create index if not exists kost_afkrydsning_borger_idx on public.kost_afkrydsning (borger_id, dato);

alter table public.kost_maaltider   enable row level security;
alter table public.kost_regler      enable row level security;
alter table public.kost_punkter     enable row level security;
alter table public.kost_afkrydsning enable row level security;
revoke all on public.kost_maaltider, public.kost_regler, public.kost_punkter, public.kost_afkrydsning
  from public, anon, authenticated;

-- ---------- Privat bucket til billeder ----------
-- BEVIDST ingen policies på storage.objects og ikke offentlig.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kost-billeder', 'kost-billeder', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Startliste over måltidstyper (personalet kan rette og tilføje) ----------

insert into public.kost_maaltider (navn, ikon, sortering) values
  ('Morgenmad',     'morgenmad',    10),
  ('Brunch',        'brunch',       20),
  ('Frokost',       'frokost',      30),
  ('Mellemmåltid',  'mellemmaaltid',40),
  ('Aftensmad',     'aftensmad',    50),
  ('Fredagsslik',   'slik',         60),
  ('Chips og dip',  'chips',        70)
on conflict ((lower(btrim(navn)))) do nothing;

-- ---------- Interne hjælpere ----------

create or replace function public._kost_ugedag(p_dato date)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select (array['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'])[extract(dow from p_dato)::int + 1];
$$;

-- Gælder reglen på dagen p_d?
create or replace function public._kost_gaelder(
  p_type text, p_ugedag text, p_dato date, p_fra date, p_til date, p_d date)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_fra <= p_d
     and (p_til is null or p_d < p_til)
     and (p_type = 'hver_dag'
          or (p_type = 'dato' and p_dato = p_d)
          or (p_type = 'ugedag' and p_ugedag = public._kost_ugedag(p_d)));
$$;

-- Længste række af "fulgte" dage (dage uden regler tæller ikke og bryder ikke).
-- Samme regel som i beboer-v2/app.js (kostStatistik).
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
       and public._kost_gaelder(r.hvornaar_type, r.ugedag, r.dato, r.gyldig_fra, r.gyldig_til, dage.d)
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

-- Må beboeren se dette billede? (bruges kun af edge-funktionen)
create or replace function public._kost_sti_tilladt(p_beboer uuid, p_sti text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from kost_regler r
      join kost_maaltider m on m.id = r.maaltid_id
     where r.borger_id = p_beboer and r.gyldig_til is null and m.billede_sti = p_sti)
  or exists (
    select 1 from kost_regler r
      join kost_punkter p on p.regel_id = r.id
     where r.borger_id = p_beboer and r.gyldig_til is null and p.billede_sti = p_sti);
$$;

-- Bruges billedet af en måltidstype eller et punkt? (bruges kun af edge-funktionen)
create or replace function public._kost_sti_brugt(p_sti text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from kost_maaltider where billede_sti = p_sti)
      or exists (select 1 from kost_punkter where billede_sti = p_sti);
$$;

-- Én regel med måltid og punkter som jsonb
create or replace function public._kost_regel_json(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id, 'borger_id', r.borger_id, 'maaltid_id', r.maaltid_id,
    'hvornaar_type', r.hvornaar_type, 'ugedag', r.ugedag, 'dato', r.dato,
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

-- ---------- Beboer: egen plan og afkrydsning ----------

create or replace function public.beboer_kost_hent(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  return jsonb_build_object(
    'regler', coalesce((
      select jsonb_agg(_kost_regel_json(r.id) order by r.gyldig_fra, r.id)
        from kost_regler r where r.borger_id = v_beboer), '[]'::jsonb),
    'afkrydsning', coalesce((
      select jsonb_agg(jsonb_build_object('regel_id', a.regel_id, 'dato', a.dato))
        from kost_afkrydsning a where a.borger_id = v_beboer and a.fulgt), '[]'::jsonb));
end;
$$;

-- p_fulgt = true: marker som fulgt. false: fortryd. Kun i dag (±1 døgn pga. tidszoner).
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
     or not _kost_gaelder(r.hvornaar_type, r.ugedag, r.dato, r.gyldig_fra, r.gyldig_til, p_dato) then
    raise exception 'Ugyldigt måltid';
  end if;
  insert into kost_afkrydsning (borger_id, regel_id, dato, fulgt)
    values (v_beboer, p_regel_id, p_dato, p_fulgt)
  on conflict (regel_id, dato) do update set fulgt = excluded.fulgt;
end;
$$;

-- ---------- Tema: "legende" er hemmeligt og låses op ved 30 dage i træk ----------

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.beboer_app_indstillinger'::regclass
       and contype = 'c' and pg_get_constraintdef(oid) like '%tema%'
  loop
    execute format('alter table public.beboer_app_indstillinger drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.beboer_app_indstillinger
  add constraint beboer_app_indstillinger_tema_check
  check (tema in ('standard','zombie','bowling','gamer','natur','dyr','legende'));

create or replace function public.beboer_saet_tema(p_token text, p_tema text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  if p_tema not in ('standard','zombie','bowling','gamer','natur','dyr','legende') then
    raise exception 'Ukendt tema';
  end if;
  if p_tema = 'legende' and _kost_laengste_stime(v_beboer) < 30 then
    raise exception 'Temaet er endnu ikke låst op';
  end if;
  update beboer_app_indstillinger set tema = p_tema, opdateret_at = now() where beboer_id = v_beboer;
end;
$$;

-- ---------- Personale: måltidstyper ----------

create or replace function public.personale_kost_gem_maaltid(
  p_token text, p_id uuid, p_navn text, p_ikon text, p_billede_sti text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text := btrim(coalesce(p_navn, ''));
  v_ikon text := nullif(btrim(coalesce(p_ikon, '')), '');
  v_bil  text := nullif(btrim(coalesce(p_billede_sti, '')), '');
  v_id uuid;
begin
  perform _personale_tjek_token(p_token);
  if length(v_navn) < 1 or length(v_navn) > 40 then
    raise exception 'Måltidet skal have et navn på højst 40 tegn';
  end if;
  if v_bil is not null then v_ikon := null; end if;
  if v_bil is null and v_ikon is null then v_ikon := 'aftensmad'; end if;
  if exists (select 1 from kost_maaltider where lower(btrim(navn)) = lower(v_navn)
                and (p_id is null or id <> p_id)) then
    raise exception 'Der findes allerede et måltid med det navn';
  end if;
  if p_id is null then
    insert into kost_maaltider (navn, ikon, billede_sti, sortering)
      values (v_navn, v_ikon, v_bil, coalesce((select max(sortering) from kost_maaltider), 0) + 10)
      returning id into v_id;
  else
    update kost_maaltider set navn = v_navn, ikon = v_ikon, billede_sti = v_bil
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Måltidet findes ikke'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.personale_kost_slet_maaltid(p_token text, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  if exists (select 1 from kost_regler where maaltid_id = p_id) then
    raise exception 'Måltidet bruges af en regel og kan ikke slettes';
  end if;
  delete from kost_maaltider where id = p_id;
end;
$$;

-- ---------- Personale: regler ----------

-- Alt i ét: måltidstyper, aktive regler (alle borgere) og afkrydsninger på p_lokal_dato.
create or replace function public.personale_kost_hent(p_token text, p_lokal_dato date)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return jsonb_build_object(
    'maaltider', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'ikon', ikon,
                                          'billede_sti', billede_sti, 'sortering', sortering)
                       order by sortering, navn) from kost_maaltider), '[]'::jsonb),
    'regler', coalesce((
      select jsonb_agg(_kost_regel_json(id) order by borger_id, sortering, gyldig_fra)
        from kost_regler where gyldig_til is null), '[]'::jsonb),
    'afkrydsning', coalesce((
      select jsonb_agg(jsonb_build_object('regel_id', regel_id, 'borger_id', borger_id))
        from kost_afkrydsning where dato = p_lokal_dato and fulgt), '[]'::jsonb));
end;
$$;

-- p_punkter: [{"navn":"Havregryn","maengde":"1 portion","ikon":null,"billede_sti":null}, …]
create or replace function public.personale_kost_gem_regel(
  p_token text, p_regel_id uuid, p_borger_id uuid, p_maaltid_id uuid,
  p_hvornaar_type text, p_ugedag text, p_dato date, p_punkter jsonb,
  p_navn text, p_lokal_dato date)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_fra date;
  v_navn text := btrim(coalesce(p_navn, ''));
begin
  perform _personale_tjek_token(p_token);
  if length(v_navn) = 0 then raise exception 'Medarbejdernavn mangler'; end if;
  if p_lokal_dato is null then raise exception 'Dato mangler'; end if;
  if not exists (select 1 from beboere where id = p_borger_id) then raise exception 'Ukendt borger'; end if;
  if not exists (select 1 from kost_maaltider where id = p_maaltid_id) then raise exception 'Ukendt måltid'; end if;
  if p_hvornaar_type not in ('hver_dag','ugedag','dato') then raise exception 'Ugyldigt tidspunkt'; end if;
  if p_hvornaar_type = 'ugedag' and (p_ugedag is null
     or p_ugedag not in ('Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag')) then
    raise exception 'Vælg en ugedag';
  end if;
  if p_hvornaar_type = 'dato' and p_dato is null then raise exception 'Vælg en dato'; end if;
  if p_punkter is null or jsonb_typeof(p_punkter) <> 'array' or jsonb_array_length(p_punkter) > 30 then
    raise exception 'Punkterne er ugyldige';
  end if;
  if exists (select 1 from jsonb_array_elements(p_punkter) e
              where length(btrim(coalesce(e ->> 'navn', ''))) not between 1 and 60) then
    raise exception 'Alle punkter skal have et navn';
  end if;

  v_fra := case when p_hvornaar_type = 'dato' then least(p_lokal_dato, p_dato) else p_lokal_dato end;

  if p_regel_id is null then
    insert into kost_regler (borger_id, maaltid_id, hvornaar_type, ugedag, dato,
                             gyldig_fra, opdateret_af, opdateret_tidspunkt)
      values (p_borger_id, p_maaltid_id, p_hvornaar_type,
              case when p_hvornaar_type = 'ugedag' then p_ugedag end,
              case when p_hvornaar_type = 'dato' then p_dato end,
              v_fra, v_navn, now())
      returning id into v_id;
  else
    -- Rettelser gælder med det samme; gyldig_fra og afkrydsninger beholdes
    update kost_regler
       set borger_id = p_borger_id, maaltid_id = p_maaltid_id, hvornaar_type = p_hvornaar_type,
           ugedag = case when p_hvornaar_type = 'ugedag' then p_ugedag end,
           dato = case when p_hvornaar_type = 'dato' then p_dato end,
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

-- Har reglen afkrydsninger, lukkes den (point og medaljer bliver stående). Ellers slettes den.
create or replace function public.personale_kost_slet_regel(p_token text, p_regel_id uuid, p_lokal_dato date)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  if p_lokal_dato is null then raise exception 'Dato mangler'; end if;
  if exists (select 1 from kost_afkrydsning where regel_id = p_regel_id) then
    update kost_regler set gyldig_til = greatest(p_lokal_dato, gyldig_fra), opdateret_tidspunkt = now()
     where id = p_regel_id and gyldig_til is null;
  else
    delete from kost_regler where id = p_regel_id;
  end if;
end;
$$;

-- Kopierer en regel (med punkter) til en anden borger. Mængden rettes bagefter.
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
  insert into kost_regler (borger_id, maaltid_id, hvornaar_type, ugedag, dato, gyldig_fra, opdateret_af)
    select p_til_borger, maaltid_id, hvornaar_type, ugedag, dato,
           case when hvornaar_type = 'dato' then least(p_lokal_dato, dato) else p_lokal_dato end, v_navn
      from kost_regler where id = p_regel_id and gyldig_til is null
    returning id into v_ny;
  if v_ny is null then raise exception 'Reglen findes ikke'; end if;
  insert into kost_punkter (regel_id, navn, maengde, ikon, billede_sti, sortering)
    select v_ny, navn, maengde, ikon, billede_sti, sortering from kost_punkter where regel_id = p_regel_id;
  return v_ny;
end;
$$;

-- ---------- Rettigheder ----------

revoke execute on function
  public._kost_ugedag(date), public._kost_gaelder(text, text, date, date, date, date),
  public._kost_laengste_stime(uuid), public._kost_sti_tilladt(uuid, text),
  public._kost_sti_brugt(text), public._kost_regel_json(uuid)
  from public, anon, authenticated;

revoke execute on function
  public.beboer_kost_hent(text), public.beboer_kost_afkryds(text, uuid, date, boolean),
  public.personale_kost_gem_maaltid(text, uuid, text, text, text),
  public.personale_kost_slet_maaltid(text, uuid),
  public.personale_kost_hent(text, date),
  public.personale_kost_gem_regel(text, uuid, uuid, uuid, text, text, date, jsonb, text, date),
  public.personale_kost_slet_regel(text, uuid, date),
  public.personale_kost_kopier_regel(text, uuid, uuid, text, date)
  from public;

grant execute on function
  public.beboer_kost_hent(text), public.beboer_kost_afkryds(text, uuid, date, boolean),
  public.personale_kost_gem_maaltid(text, uuid, text, text, text),
  public.personale_kost_slet_maaltid(text, uuid),
  public.personale_kost_hent(text, date),
  public.personale_kost_gem_regel(text, uuid, uuid, uuid, text, text, date, jsonb, text, date),
  public.personale_kost_slet_regel(text, uuid, date),
  public.personale_kost_kopier_regel(text, uuid, uuid, text, date)
  to anon, authenticated;
