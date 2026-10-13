-- ====================================================================
-- beboer-v2 / Træning — fase 1: tabeller, RLS, funktioner, startbibliotek
--
-- Sikkerhedsmodel
--   * Alle tabeller har RLS slået til og INGEN policies, og anon/authenticated
--     har ingen tabelrettigheder. Tabellerne kan derfor kun nås via
--     SECURITY DEFINER-funktionerne nedenfor.
--   * Beboere: fornavn + 4-cifret kode -> beboer_login() -> tilfældig token.
--     Kun SHA-256 af token gemmes. Alle beboer_*-funktioner udleder beboer_id
--     FRA TOKEN (aldrig fra en parameter), så en beboer kun ser egne data.
--   * Personale: personalekode -> personale_login() -> token. Samme mønster.
--   * Brugerbeboerne forbliver rolle `anon` — ingen Supabase Auth-brugere,
--     så de eksisterende `auth_all`-policies på andre tabeller berøres ikke.
--   * Låsning: 5 forkerte forsøg => 15 min pause (beboer og personale).
--     Fejl returneres som jsonb (ikke exception), ellers ruller tælleren tilbage.
--
-- Første personalekode sættes manuelt i Supabase SQL-editoren:
--     select public.personale_saet_kode('<din-kode-min-8-tegn>');
-- ====================================================================

-- ---------- Tabeller ----------

create table if not exists public.ovelser (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  navn          text not null check (length(btrim(navn)) > 0),
  beskrivelse   text not null default '' check (length(beskrivelse) <= 300),
  billede_sti   text,              -- relativ sti i repo: beboer-v2/ovelser/...
  billede2_sti  text,              -- 2. billede (slutposition), vises som skiftende "gif"
  gif_sti       text,
  kategori      text not null check (kategori in ('led','styrke','straek','balance','cardio')),
  aktiv         boolean not null default true,
  sortering     integer not null default 0,
  kilde         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.traeningsprogrammer (
  id           uuid primary key default gen_random_uuid(),
  beboer_id    uuid not null references public.beboere(id) on delete cascade,
  navn         text not null check (length(btrim(navn)) between 1 and 60),
  dage         text[] not null default '{}'
               check (dage <@ array['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag']::text[]),
  aktiv        boolean not null default true,
  oprettet_af  text not null check (length(btrim(oprettet_af)) > 0),
  oprettet_at  timestamptz not null default now(),
  opdateret_at timestamptz not null default now()
);
create index if not exists traeningsprogrammer_beboer_idx on public.traeningsprogrammer (beboer_id);

create table if not exists public.program_ovelser (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.traeningsprogrammer(id) on delete cascade,
  ovelse_id     uuid not null references public.ovelser(id),
  raekkefoelge  integer not null,
  saet          integer not null check (saet between 1 and 10),
  gentagelser   integer not null check (gentagelser between 1 and 50),
  pause_sek     integer not null default 30 check (pause_sek between 0 and 300)
);
create index if not exists program_ovelser_program_idx on public.program_ovelser (program_id, raekkefoelge);

create table if not exists public.traening_log (
  id           uuid primary key default gen_random_uuid(),
  beboer_id    uuid not null references public.beboere(id) on delete cascade,
  program_id   uuid references public.traeningsprogrammer(id) on delete set null,
  ovelse_id    uuid references public.ovelser(id) on delete set null,
  saet_nr      integer not null check (saet_nr between 1 and 20),
  faerdig_tid  timestamptz not null default now(),
  lokal_dato   date not null     -- enhedens lokale dato, bruges til statistik
);
create index if not exists traening_log_beboer_idx on public.traening_log (beboer_id, lokal_dato);

create table if not exists public.beboer_app_indstillinger (
  beboer_id     uuid primary key references public.beboere(id) on delete cascade,
  tema          text not null default 'standard' check (tema in ('standard','zombie','bowling')),
  kode_hash     text,
  fejlforsoeg   integer not null default 0,
  last_fejl_at  timestamptz,
  opdateret_at  timestamptz not null default now()
);

create table if not exists public.beboer_sessions (
  id           uuid primary key default gen_random_uuid(),
  beboer_id    uuid not null references public.beboere(id) on delete cascade,
  token_hash   text not null unique,
  oprettet     timestamptz not null default now(),
  sidst_brugt  timestamptz not null default now(),
  tilbagekaldt boolean not null default false
);

create table if not exists public.personale_adgang (
  id            uuid primary key default gen_random_uuid(),
  kode_hash     text not null,
  fejlforsoeg   integer not null default 0,
  last_fejl_at  timestamptz
);

create table if not exists public.personale_sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  oprettet     timestamptz not null default now(),
  sidst_brugt  timestamptz not null default now(),
  tilbagekaldt boolean not null default false
);

-- ---------- RLS: slået til, ingen policies, ingen direkte rettigheder ----------

alter table public.ovelser                  enable row level security;
alter table public.traeningsprogrammer      enable row level security;
alter table public.program_ovelser          enable row level security;
alter table public.traening_log             enable row level security;
alter table public.beboer_app_indstillinger enable row level security;
alter table public.beboer_sessions          enable row level security;
alter table public.personale_adgang         enable row level security;
alter table public.personale_sessions       enable row level security;

revoke all on public.ovelser, public.traeningsprogrammer, public.program_ovelser,
              public.traening_log, public.beboer_app_indstillinger,
              public.beboer_sessions, public.personale_adgang,
              public.personale_sessions
  from public, anon, authenticated;

-- ---------- Interne hjælpefunktioner (ikke kaldbare udefra) ----------

create or replace function public._beboer_fra_token(p_token text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_id uuid;
  v_beboer uuid;
  v_sidst timestamptz;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'ikke logget ind' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select id, beboer_id, sidst_brugt into v_id, v_beboer, v_sidst
    from beboer_sessions
   where token_hash = v_hash and not tilbagekaldt
     and sidst_brugt > now() - interval '90 days';
  if v_id is null then
    raise exception 'ikke logget ind' using errcode = '28000';
  end if;
  if v_sidst < now() - interval '1 hour' then
    update beboer_sessions set sidst_brugt = now() where id = v_id;
  end if;
  return v_beboer;
end;
$$;

create or replace function public._personale_tjek_token(p_token text)
returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_id uuid;
  v_sidst timestamptz;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'ikke logget ind' using errcode = '28000';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select id, sidst_brugt into v_id, v_sidst
    from personale_sessions
   where token_hash = v_hash and not tilbagekaldt
     and sidst_brugt > now() - interval '180 days';
  if v_id is null then
    raise exception 'ikke logget ind' using errcode = '28000';
  end if;
  if v_sidst < now() - interval '1 hour' then
    update personale_sessions set sidst_brugt = now() where id = v_id;
  end if;
end;
$$;

-- Program med øvelser som jsonb (genbruges af beboer- og personalefunktioner)
create or replace function public._program_json(p_program_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id, 'beboer_id', p.beboer_id, 'navn', p.navn, 'dage', to_jsonb(p.dage),
    'aktiv', p.aktiv, 'oprettet_af', p.oprettet_af,
    'oprettet_at', p.oprettet_at, 'opdateret_at', p.opdateret_at,
    'ovelser', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ovelse_id', o.id, 'raekkefoelge', po.raekkefoelge,
               'navn', o.navn, 'beskrivelse', o.beskrivelse,
               'billede_sti', o.billede_sti, 'billede2_sti', o.billede2_sti, 'gif_sti', o.gif_sti,
               'saet', po.saet, 'gentagelser', po.gentagelser, 'pause_sek', po.pause_sek)
             order by po.raekkefoelge)
        from program_ovelser po join ovelser o on o.id = po.ovelse_id
       where po.program_id = p.id), '[]'::jsonb))
  from traeningsprogrammer p where p.id = p_program_id;
$$;

-- ---------- Personale: kode og login ----------

-- Kun postgres/dashboard kan sætte personalekoden (ikke anon/authenticated).
create or replace function public.personale_saet_kode(p_kode text)
returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_kode is null or length(p_kode) < 8 then
    raise exception 'Personalekoden skal være mindst 8 tegn';
  end if;
  delete from personale_adgang;
  insert into personale_adgang (kode_hash) values (crypt(p_kode, gen_salt('bf', 10)));
  update personale_sessions set tilbagekaldt = true;
end;
$$;

create or replace function public.personale_login(p_kode text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r personale_adgang%rowtype;
  v_token text;
begin
  select * into r from personale_adgang limit 1;
  if r.id is null then
    return jsonb_build_object('ok', false, 'fejl', 'forkert');
  end if;
  if r.fejlforsoeg >= 5 and r.last_fejl_at > now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'fejl', 'laast');
  end if;
  if p_kode is null or crypt(p_kode, r.kode_hash) <> r.kode_hash then
    update personale_adgang
       set fejlforsoeg = case when last_fejl_at > now() - interval '15 minutes' then fejlforsoeg + 1 else 1 end,
           last_fejl_at = now()
     where id = r.id;
    return jsonb_build_object('ok', false, 'fejl', 'forkert');
  end if;
  update personale_adgang set fejlforsoeg = 0, last_fejl_at = null where id = r.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into personale_sessions (token_hash)
    values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

create or replace function public.personale_logud(p_token text)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update personale_sessions set tilbagekaldt = true
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- ---------- Personale: bibliotek, programmer, log, koder ----------

create or replace function public.personale_hent_ovelser(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', id, 'slug', slug, 'navn', navn, 'beskrivelse', beskrivelse,
             'billede_sti', billede_sti, 'billede2_sti', billede2_sti, 'gif_sti', gif_sti,
             'kategori', kategori) order by sortering, navn)
      from ovelser where aktiv), '[]'::jsonb);
end;
$$;

create or replace function public.personale_hent_programmer(p_token text, p_beboer_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return coalesce((
    select jsonb_agg(_program_json(id) order by navn)
      from traeningsprogrammer
     where p_beboer_id is null or beboer_id = p_beboer_id), '[]'::jsonb);
end;
$$;

-- Opretter (p_program_id null) eller opdaterer et program og erstatter øvelserne.
-- p_ovelser: [{"ovelse_id":"…","saet":3,"gentagelser":10,"pause_sek":30}, …] i rækkefølge.
create or replace function public.personale_gem_program(
  p_token text, p_program_id uuid, p_beboer_id uuid, p_navn text,
  p_dage text[], p_aktiv boolean, p_oprettet_af text, p_ovelser jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_antal integer;
begin
  perform _personale_tjek_token(p_token);
  if not exists (select 1 from beboere where id = p_beboer_id) then
    raise exception 'Ukendt beboer';
  end if;
  if p_navn is null or length(btrim(p_navn)) = 0 then
    raise exception 'Programmet skal have et navn';
  end if;
  if p_oprettet_af is null or length(btrim(p_oprettet_af)) = 0 then
    raise exception 'Medarbejdernavn mangler';
  end if;
  if p_ovelser is null or jsonb_typeof(p_ovelser) <> 'array' then
    raise exception 'Øvelser mangler';
  end if;
  v_antal := jsonb_array_length(p_ovelser);
  if v_antal < 1 or v_antal > 30 then
    raise exception 'Et program skal have 1-30 øvelser';
  end if;

  if p_program_id is null then
    insert into traeningsprogrammer (beboer_id, navn, dage, aktiv, oprettet_af)
      values (p_beboer_id, btrim(p_navn), coalesce(p_dage, '{}'), coalesce(p_aktiv, true), btrim(p_oprettet_af))
      returning id into v_id;
  else
    update traeningsprogrammer
       set beboer_id = p_beboer_id, navn = btrim(p_navn), dage = coalesce(p_dage, '{}'),
           aktiv = coalesce(p_aktiv, true), opdateret_at = now()
     where id = p_program_id
     returning id into v_id;
    if v_id is null then raise exception 'Programmet findes ikke'; end if;
    delete from program_ovelser where program_id = v_id;
  end if;

  insert into program_ovelser (program_id, ovelse_id, raekkefoelge, saet, gentagelser, pause_sek)
  select v_id, (e.value ->> 'ovelse_id')::uuid, (e.ordinality - 1)::int,
         (e.value ->> 'saet')::int, (e.value ->> 'gentagelser')::int,
         coalesce((e.value ->> 'pause_sek')::int, 30)
    from jsonb_array_elements(p_ovelser) with ordinality as e(value, ordinality);

  return v_id;
end;
$$;

create or replace function public.personale_slet_program(p_token text, p_program_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  delete from traeningsprogrammer where id = p_program_id;   -- log bevares (program_id => null)
end;
$$;

create or replace function public.personale_kopier_program(
  p_token text, p_program_id uuid, p_til_beboer_id uuid, p_oprettet_af text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ny uuid;
begin
  perform _personale_tjek_token(p_token);
  if not exists (select 1 from beboere where id = p_til_beboer_id) then
    raise exception 'Ukendt beboer';
  end if;
  if p_oprettet_af is null or length(btrim(p_oprettet_af)) = 0 then
    raise exception 'Medarbejdernavn mangler';
  end if;
  insert into traeningsprogrammer (beboer_id, navn, dage, aktiv, oprettet_af)
    select p_til_beboer_id, navn, dage, true, btrim(p_oprettet_af)
      from traeningsprogrammer where id = p_program_id
    returning id into v_ny;
  if v_ny is null then raise exception 'Programmet findes ikke'; end if;
  insert into program_ovelser (program_id, ovelse_id, raekkefoelge, saet, gentagelser, pause_sek)
    select v_ny, ovelse_id, raekkefoelge, saet, gentagelser, pause_sek
      from program_ovelser where program_id = p_program_id;
  return v_ny;
end;
$$;

-- Seneste træninger pr. dag og program (simpel oversigt).
create or replace function public.personale_hent_log(p_token text, p_beboer_id uuid default null, p_antal integer default 30)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return coalesce((
    select jsonb_agg(x order by (x ->> 'sidste_tid') desc) from (
      select jsonb_build_object(
               'beboer_id', l.beboer_id, 'beboer', b.navn, 'lokal_dato', l.lokal_dato,
               'program_id', l.program_id, 'program', p.navn,
               'saet_antal', count(*), 'ovelser_antal', count(distinct l.ovelse_id),
               'sidste_tid', max(l.faerdig_tid)) as x
        from traening_log l
        join beboere b on b.id = l.beboer_id
        left join traeningsprogrammer p on p.id = l.program_id
       where p_beboer_id is null or l.beboer_id = p_beboer_id
       group by l.beboer_id, b.navn, l.lokal_dato, l.program_id, p.navn
       order by max(l.faerdig_tid) desc
       limit greatest(1, least(coalesce(p_antal, 30), 200))
    ) s), '[]'::jsonb);
end;
$$;

create or replace function public.personale_saet_beboer_kode(p_token text, p_beboer_id uuid, p_kode text)
returns void
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  if not exists (select 1 from beboere where id = p_beboer_id) then
    raise exception 'Ukendt beboer';
  end if;
  if p_kode is null or p_kode !~ '^[0-9]{4}$' then
    raise exception 'Koden skal være præcis 4 cifre';
  end if;
  insert into beboer_app_indstillinger (beboer_id, kode_hash)
    values (p_beboer_id, crypt(p_kode, gen_salt('bf', 8)))
  on conflict (beboer_id) do update
    set kode_hash = excluded.kode_hash, fejlforsoeg = 0, last_fejl_at = null, opdateret_at = now();
  update beboer_sessions set tilbagekaldt = true where beboer_id = p_beboer_id;
end;
$$;

create or replace function public.personale_tilbagekald_enheder(p_token text, p_beboer_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  update beboer_sessions set tilbagekaldt = true where beboer_id = p_beboer_id;
end;
$$;

-- Status pr. beboer: har koden, antal aktive enheder (til personalesektionen).
create or replace function public.personale_beboer_status(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'beboer_id', b.id, 'navn', b.navn,
             'har_kode', (i.kode_hash is not null),
             'tema', coalesce(i.tema, 'standard'),
             'enheder', (select count(*) from beboer_sessions s
                          where s.beboer_id = b.id and not s.tilbagekaldt
                            and s.sidst_brugt > now() - interval '90 days'))
           order by b.sortering)
      from beboere b left join beboer_app_indstillinger i on i.beboer_id = b.id), '[]'::jsonb);
end;
$$;

-- ---------- Beboer: login og egne data ----------

create or replace function public.beboer_login(p_navn text, p_kode text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_beboer beboere%rowtype;
  i beboer_app_indstillinger%rowtype;
  v_token text;
begin
  select * into v_beboer from beboere where lower(navn) = lower(btrim(coalesce(p_navn, ''))) limit 1;
  if v_beboer.id is null then
    return jsonb_build_object('ok', false, 'fejl', 'forkert');
  end if;
  select * into i from beboer_app_indstillinger where beboer_id = v_beboer.id;
  if i.beboer_id is null or i.kode_hash is null then
    return jsonb_build_object('ok', false, 'fejl', 'forkert');
  end if;
  if i.fejlforsoeg >= 5 and i.last_fejl_at > now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'fejl', 'laast');
  end if;
  if p_kode is null or p_kode !~ '^[0-9]{4}$' or crypt(p_kode, i.kode_hash) <> i.kode_hash then
    update beboer_app_indstillinger
       set fejlforsoeg = case when last_fejl_at > now() - interval '15 minutes' then fejlforsoeg + 1 else 1 end,
           last_fejl_at = now()
     where beboer_id = v_beboer.id;
    return jsonb_build_object('ok', false, 'fejl', 'forkert');
  end if;
  update beboer_app_indstillinger set fejlforsoeg = 0, last_fejl_at = null where beboer_id = v_beboer.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into beboer_sessions (beboer_id, token_hash)
    values (v_beboer.id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  return jsonb_build_object('ok', true, 'token', v_token, 'navn', v_beboer.navn, 'tema', i.tema);
end;
$$;

create or replace function public.beboer_session_tjek(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  begin
    v_id := _beboer_fra_token(p_token);
  exception when sqlstate '28000' then
    return jsonb_build_object('ok', false);
  end;
  return (select jsonb_build_object('ok', true, 'navn', b.navn,
                                    'tema', coalesce(i.tema, 'standard'))
            from beboere b left join beboer_app_indstillinger i on i.beboer_id = b.id
           where b.id = v_id);
end;
$$;

create or replace function public.beboer_logud(p_token text)
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  update beboer_sessions set tilbagekaldt = true
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Beboerens egne aktive programmer (med øvelser).
create or replace function public.beboer_hent_programmer(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  return coalesce((
    select jsonb_agg(_program_json(id) order by navn)
      from traeningsprogrammer where beboer_id = v_beboer and aktiv), '[]'::jsonb);
end;
$$;

-- Gemmer ét færdigt sæt. Programmet skal tilhøre beboeren og øvelsen indgå i det.
create or replace function public.beboer_log_saet(
  p_token text, p_program_id uuid, p_ovelse_id uuid, p_saet_nr integer, p_lokal_dato date)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
  v_id uuid;
begin
  if not exists (
    select 1 from traeningsprogrammer p
      join program_ovelser po on po.program_id = p.id
     where p.id = p_program_id and p.beboer_id = v_beboer and p.aktiv
       and po.ovelse_id = p_ovelse_id and p_saet_nr between 1 and po.saet
  ) then
    raise exception 'Ugyldigt sæt';
  end if;
  if p_lokal_dato is null or abs(p_lokal_dato - current_date) > 2 then
    raise exception 'Ugyldig dato';
  end if;
  insert into traening_log (beboer_id, program_id, ovelse_id, saet_nr, lokal_dato)
    values (v_beboer, p_program_id, p_ovelse_id, p_saet_nr, p_lokal_dato)
    returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Beboerens egen log (seneste 400 dage) til statistik og medaljer.
create or replace function public.beboer_hent_log(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'lokal_dato', lokal_dato, 'program_id', program_id, 'ovelse_id', ovelse_id,
             'saet_nr', saet_nr, 'faerdig_tid', faerdig_tid) order by faerdig_tid)
      from traening_log
     where beboer_id = v_beboer and lokal_dato > current_date - 400), '[]'::jsonb);
end;
$$;

create or replace function public.beboer_saet_tema(p_token text, p_tema text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  if p_tema not in ('standard','zombie','bowling') then
    raise exception 'Ukendt tema';
  end if;
  update beboer_app_indstillinger set tema = p_tema, opdateret_at = now() where beboer_id = v_beboer;
end;
$$;

-- ---------- Rettigheder på funktioner ----------

revoke execute on function
  public._beboer_fra_token(text), public._personale_tjek_token(text), public._program_json(uuid),
  public.personale_saet_kode(text)
  from public, anon, authenticated;

revoke execute on function
  public.personale_login(text), public.personale_logud(text),
  public.personale_hent_ovelser(text), public.personale_hent_programmer(text, uuid),
  public.personale_gem_program(text, uuid, uuid, text, text[], boolean, text, jsonb),
  public.personale_slet_program(text, uuid), public.personale_kopier_program(text, uuid, uuid, text),
  public.personale_hent_log(text, uuid, integer), public.personale_saet_beboer_kode(text, uuid, text),
  public.personale_tilbagekald_enheder(text, uuid), public.personale_beboer_status(text),
  public.beboer_login(text, text), public.beboer_session_tjek(text), public.beboer_logud(text),
  public.beboer_hent_programmer(text), public.beboer_log_saet(text, uuid, uuid, integer, date),
  public.beboer_hent_log(text), public.beboer_saet_tema(text, text)
  from public;

grant execute on function
  public.personale_login(text), public.personale_logud(text),
  public.personale_hent_ovelser(text), public.personale_hent_programmer(text, uuid),
  public.personale_gem_program(text, uuid, uuid, text, text[], boolean, text, jsonb),
  public.personale_slet_program(text, uuid), public.personale_kopier_program(text, uuid, uuid, text),
  public.personale_hent_log(text, uuid, integer), public.personale_saet_beboer_kode(text, uuid, text),
  public.personale_tilbagekald_enheder(text, uuid), public.personale_beboer_status(text),
  public.beboer_login(text, text), public.beboer_session_tjek(text), public.beboer_logud(text),
  public.beboer_hent_programmer(text), public.beboer_log_saet(text, uuid, uuid, integer, date),
  public.beboer_hent_log(text), public.beboer_saet_tema(text, text)
  to anon, authenticated;

-- ---------- Oprydning af gamle sessioner (pg_cron) ----------

select cron.schedule('ryd-traening-sessions', '45 3 * * *', $job$
  delete from public.beboer_sessions   where sidst_brugt < now() - interval '120 days' or tilbagekaldt;
  delete from public.personale_sessions where sidst_brugt < now() - interval '200 days' or tilbagekaldt;
$job$);

-- ---------- Startbibliotek (26 øvelser, danske navne) ----------
-- Billeder: free-exercise-db (Unlicense / public domain), lagt i beboer-v2/ovelser/.
-- Øvelser uden billede (billede_sti null) får egne SVG-ikoner i appen.

insert into public.ovelser (slug, navn, beskrivelse, billede_sti, billede2_sti, kategori, sortering, kilde) values
 ('gang-paa-stedet',      'Gang på stedet',        'Gå på stedet i et roligt tempo. Løft knæene let og sving med armene.', null, null, 'cardio', 10, 'egen'),
 ('rejs-dig-fra-stol',    'Rejs dig fra stol',     'Sid på kanten af en stol. Rejs dig op, og sæt dig langsomt igen.', null, null, 'styrke', 20, 'egen'),
 ('let-squat',            'Let squat',             'Stå med fødderne i hoftebredde. Bøj knæene lidt, som om du vil sætte dig, og rejs dig igen.', null, null, 'styrke', 30, 'egen'),
 ('vaeg-armstraek',       'Væg-armstræk',          'Stå en armlængde fra væggen med hænderne på væggen. Bøj armene, og skub dig væk igen.', null, null, 'styrke', 40, 'egen'),
 ('taahaevninger',        'Tåhævninger',           'Stå op og hold fast i en stol. Kom op på tæerne, og sænk hælene igen.', null, null, 'styrke', 50, 'egen'),
 ('armcirkler',           'Armcirkler',            'Stå med armene ud til siden. Lav små cirkler med armene.', 'beboer-v2/ovelser/armcirkler-1.jpg', 'beboer-v2/ovelser/armcirkler-2.jpg', 'led', 60, 'free-exercise-db'),
 ('skulderrul',           'Skulderrul',            'Løft skuldrene op mod ørerne. Rul dem bagud og ned.', 'beboer-v2/ovelser/skulderrul-1.jpg', 'beboer-v2/ovelser/skulderrul-2.jpg', 'led', 70, 'free-exercise-db'),
 ('albuecirkler',         'Albuecirkler',          'Hold fingrene på skuldrene. Lav cirkler med albuerne.', 'beboer-v2/ovelser/albuecirkler-1.jpg', 'beboer-v2/ovelser/albuecirkler-2.jpg', 'led', 80, 'free-exercise-db'),
 ('haandledscirkler',     'Håndledscirkler',       'Hold armene foran dig. Drej hænderne rundt i cirkler.', 'beboer-v2/ovelser/haandledscirkler-1.jpg', 'beboer-v2/ovelser/haandledscirkler-2.jpg', 'led', 90, 'free-exercise-db'),
 ('ankelcirkler',         'Ankelcirkler',          'Hold fast i en stol. Løft en fod, og tegn en cirkel med tæerne.', 'beboer-v2/ovelser/ankelcirkler-1.jpg', 'beboer-v2/ovelser/ankelcirkler-2.jpg', 'led', 100, 'free-exercise-db'),
 ('knaecirkler',          'Knæcirkler',            'Stå med fødderne samlet og hænderne på knæene. Drej knæene rundt i små cirkler.', 'beboer-v2/ovelser/knaecirkler-1.jpg', 'beboer-v2/ovelser/knaecirkler-2.jpg', 'led', 110, 'free-exercise-db'),
 ('hoftecirkler',         'Hoftecirkler',          'Hold fast i en stol. Løft knæet, og lav en stor cirkel med det.', 'beboer-v2/ovelser/hoftecirkler-1.jpg', 'beboer-v2/ovelser/hoftecirkler-2.jpg', 'led', 120, 'free-exercise-db'),
 ('nakkestraek-til-siden','Nakkestræk til siden',  'Sid eller stå ret op. Lad øret falde mod skulderen, og hold.', 'beboer-v2/ovelser/nakkestraek-til-siden-1.jpg', 'beboer-v2/ovelser/nakkestraek-til-siden-2.jpg', 'straek', 130, 'free-exercise-db'),
 ('hagen-mod-brystet',    'Hagen mod brystet',     'Sid eller stå ret op. Lad hagen falde langsomt ned mod brystet.', 'beboer-v2/ovelser/hagen-mod-brystet-1.jpg', 'beboer-v2/ovelser/hagen-mod-brystet-2.jpg', 'straek', 140, 'free-exercise-db'),
 ('straek-armene-op',     'Stræk armene op',       'Fold hænderne, og vend håndfladerne op. Stræk armene mod loftet.', 'beboer-v2/ovelser/straek-armene-op-1.jpg', 'beboer-v2/ovelser/straek-armene-op-2.jpg', 'straek', 150, 'free-exercise-db'),
 ('sidebojning',          'Sidebøjning',           'Stå med fødderne i hoftebredde. Bøj langsomt til siden og tilbage.', 'beboer-v2/ovelser/sidebojning-1.jpg', 'beboer-v2/ovelser/sidebojning-2.jpg', 'straek', 160, 'free-exercise-db'),
 ('roer-taeerne',         'Rør tæerne',            'Stå med let bøjede knæ. Lad overkroppen hænge ned, og slap af.', 'beboer-v2/ovelser/roer-taeerne-1.jpg', 'beboer-v2/ovelser/roer-taeerne-2.jpg', 'straek', 170, 'free-exercise-db'),
 ('laegstraek-mod-vaeg',  'Lægstræk mod væg',      'Stå foran en væg med hænderne på væggen. Hold hælen i gulvet, og læn dig frem.', 'beboer-v2/ovelser/laegstraek-mod-vaeg-1.jpg', 'beboer-v2/ovelser/laegstraek-mod-vaeg-2.jpg', 'straek', 180, 'free-exercise-db'),
 ('straek-paa-stol',      'Stræk på stol',         'Sid på kanten af en stol, og hold fast i ryglænet. Ret armene, og træk overkroppen frem.', 'beboer-v2/ovelser/straek-paa-stol-1.jpg', 'beboer-v2/ovelser/straek-paa-stol-2.jpg', 'straek', 190, 'free-exercise-db'),
 ('ryg-straek-paa-stol',  'Rygstræk på stol',      'Sid ret op på en stol. Bøj til siden med armen over hovedet, og hold.', 'beboer-v2/ovelser/ryg-straek-paa-stol-1.jpg', 'beboer-v2/ovelser/ryg-straek-paa-stol-2.jpg', 'straek', 200, 'free-exercise-db'),
 ('knae-ind-mod-brystet', 'Knæ ind mod brystet',   'Ligg på ryggen. Træk begge knæ ind mod brystet, og hold.', 'beboer-v2/ovelser/knae-ind-mod-brystet-1.jpg', 'beboer-v2/ovelser/knae-ind-mod-brystet-2.jpg', 'straek', 210, 'free-exercise-db'),
 ('kat-straek',           'Kat-stræk',             'Stå på hænder og knæ. Rund ryggen op, og slap af igen.', 'beboer-v2/ovelser/kat-straek-1.jpg', 'beboer-v2/ovelser/kat-straek-2.jpg', 'straek', 220, 'free-exercise-db'),
 ('barnets-stilling',     'Barnets stilling',      'Sæt dig på hælene. Stræk armene frem, og lad panden hvile.', 'beboer-v2/ovelser/barnets-stilling-1.jpg', 'beboer-v2/ovelser/barnets-stilling-2.jpg', 'straek', 230, 'free-exercise-db'),
 ('baekkenloeft',         'Bækkenløft',            'Ligg på ryggen med bøjede knæ. Løft numsen op fra gulvet, og sænk den igen.', 'beboer-v2/ovelser/baekkenloeft-1.jpg', 'beboer-v2/ovelser/baekkenloeft-2.jpg', 'styrke', 240, 'free-exercise-db'),
 ('benloeft-bagud',       'Benløft bagud',         'Stå på hænder og knæ. Stræk det ene ben bagud, og sænk det igen.', 'beboer-v2/ovelser/benloeft-bagud-1.jpg', 'beboer-v2/ovelser/benloeft-bagud-2.jpg', 'styrke', 250, 'free-exercise-db'),
 ('benloeft-til-siden',   'Benløft til siden',     'Hold fast i en stol. Løft det ene ben ud til siden, og sænk det igen.', 'beboer-v2/ovelser/benloeft-til-siden-1.jpg', 'beboer-v2/ovelser/benloeft-til-siden-2.jpg', 'balance', 260, 'free-exercise-db')
on conflict (slug) do nothing;

-- ---------- Fase 3: beboerens egen dagsplan (læser ugeplaner via token) ----------
create or replace function public.beboer_min_dag(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
  v_navn text;
begin
  select navn into v_navn from beboere where id = v_beboer;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'ugedag', ugedag, 'tid', tid, 'aktivitet', aktivitet, 'instruktion', instruktion))
      from ugeplaner where beboer = v_navn), '[]'::jsonb);
end;
$$;

revoke execute on function public.beboer_min_dag(text) from public;
grant execute on function public.beboer_min_dag(text) to anon, authenticated;

-- ---------- Fase 5: statistik (én række pr. dag og program, hele historikken) ----------
-- En "træning" = en dag + et program med mindst ét færdigt sæt.
create or replace function public.beboer_traeninger(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'lokal_dato', lokal_dato, 'program_id', program_id,
             'saet_antal', n, 'sidste_tid', t) order by lokal_dato)
      from (
        select lokal_dato, program_id, count(*) as n, max(faerdig_tid) as t
          from traening_log
         where beboer_id = v_beboer
         group by lokal_dato, program_id
         order by lokal_dato desc
         limit 5000
      ) x), '[]'::jsonb);
end;
$$;

revoke execute on function public.beboer_traeninger(text) from public;
grant execute on function public.beboer_traeninger(text) to anon, authenticated;
