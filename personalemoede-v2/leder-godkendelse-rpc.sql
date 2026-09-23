-- ==================================================================
-- Server-side leder-kode — erstatter det rene browser-tjek (LEDER_KODE
-- i personalemoede-v2/index.html) med en rigtig serverside-kontrol.
--
-- Baggrund: LEDER_KODE lå hardkodet i klientens JS og RLS var fuldt
-- permissiv (using(true)) på dagsordenspunkter — enhver med den
-- offentlige anon-nøgle (synlig i alle sider) kunne altså allerede
-- godkende/afvise punkter direkte via Supabase's REST-API, uanset
-- koden i UI'en. Det gjaldt både personalemoede-v2's egen leder-side
-- og den nye leder-funktion i mollebakken-app-v2 (Fase 3).
--
-- Løsning: koden gemmes hashet i en tabel INGEN klient kan læse (RLS
-- aktiveret, ingen policies), og selve godkend/afvis/udsæt-handlingen
-- flyttes ind i en SECURITY DEFINER-funktion der selv tjekker koden,
-- server-side, før den ændrer noget. Kolonnen `status` låses samtidig
-- for direkte opdatering fra klienten, så funktionen bliver eneste vej
-- ind — både fra personalemoede-v2 og fra appen.
--
-- Kør i Supabase SQL editor. Vist til godkendelse 2026-09-23, IKKE
-- kørt automatisk.
-- ==================================================================

-- I dette Supabase-projekt lander pgcrypto i skemaet `extensions`, ikke
-- `public` — funktionerne nedenfor har derfor `extensions` med i deres
-- search_path, ellers kan de ikke finde crypt()/gen_salt().
create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- leder_adgang — én række, kun kode-hashen. RLS uden policies = hverken
-- anon eller authenticated kan læse/skrive den via Supabase's API.
-- Kun SECURITY DEFINER-funktionerne nedenfor (ejet af den rolle der
-- kører SQL editoren, typisk `postgres`) kan tilgå den.
-- ------------------------------------------------------------------

create table leder_adgang (
  id        uuid primary key default gen_random_uuid(),
  kode_hash text not null
);

alter table leder_adgang enable row level security;

-- Sætter den til den nuværende kode ('1234'), så ingen adfærd ændrer
-- sig ved udrulning. Skift den til noget stærkere når som helst med:
--   update leder_adgang set kode_hash = crypt('NY-KODE', gen_salt('bf'));
insert into leder_adgang (kode_hash) values (crypt('1234', gen_salt('bf')));

-- ------------------------------------------------------------------
-- leder_kode_gyldig — bruges til blot at TJEKKE koden (fx for at låse
-- leder-panelet op i UI'en), uden at ændre noget.
-- ------------------------------------------------------------------

create or replace function leder_kode_gyldig(p_kode text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select kode_hash into v_hash from leder_adgang limit 1;
  return v_hash is not null and crypt(p_kode, v_hash) = v_hash;
end;
$$;

grant execute on function leder_kode_gyldig(text) to anon, authenticated;

-- ------------------------------------------------------------------
-- godkend_dagsordenspunkt — den eneste vej til at godkende/afvise/
-- udsætte et punkt. p_raekkefoelge er valgfri, bruges når et punkt
-- godkendes (samme beregning som i dag, se godkendPunkt() i
-- personalemoede-v2/index.html) så status+rækkefølge sættes atomisk.
-- ------------------------------------------------------------------

create or replace function godkend_dagsordenspunkt(
  p_kode text,
  p_punkt_id uuid,
  p_handling text,             -- 'godkendt' | 'afvist' | 'udsat'
  p_begrundelse text default null,
  p_raekkefoelge int default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not leder_kode_gyldig(p_kode) then
    raise exception 'Forkert kode' using errcode = '28000';
  end if;

  if p_handling not in ('godkendt','afvist','udsat') then
    raise exception 'Ugyldig handling: %', p_handling;
  end if;

  -- Sættes transaktion-lokalt (tredje arg 'true') lige før selve
  -- opdateringen — triggeren nedenfor tjekker for dette, så KUN
  -- opdateringer herfra må ændre status. Nulstilles automatisk når
  -- transaktionen slutter.
  perform set_config('app.via_godkend_funktion', 'true', true);

  update dagsordenspunkter
    set status = p_handling,
        afvist_begrundelse = case when p_handling = 'afvist' then p_begrundelse else afvist_begrundelse end,
        raekkefoelge = coalesce(p_raekkefoelge, raekkefoelge)
    where id = p_punkt_id;
end;
$$;

grant execute on function godkend_dagsordenspunkt(text, uuid, text, text, int) to anon, authenticated;

-- ------------------------------------------------------------------
-- Forhindr direkte ændring af `status` fra klienten, uafhængigt af
-- REVOKE/GRANT-opsætning (som viste sig upålidelig at verificere i
-- praksis her) — en BEFORE UPDATE-trigger fanger ALTID forsøget,
-- uanset hvilken rolle der forsøger. Kun godkend_dagsordenspunkt()
-- ovenfor sætter flaget der lader ændringen passere.
-- ------------------------------------------------------------------

create or replace function bloker_direkte_status_aendring()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.via_godkend_funktion', true), '') <> 'true' then
    raise exception 'status må kun ændres via godkend_dagsordenspunkt()' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists dagsordenspunkter_status_vagt on dagsordenspunkter;
create trigger dagsordenspunkter_status_vagt
before update on dagsordenspunkter
for each row execute function bloker_direkte_status_aendring();
