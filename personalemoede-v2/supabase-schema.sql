-- ==================================================================
-- personalemoede-v2 — datamodel + RLS
-- Kør i Supabase SQL editor (projekt lumxvqhlmokspqnazhso, samme som
-- personaletavle-v2 / mollebakken-app-v2 / personaleskaerm-v2).
-- Fase 1 — vist til godkendelse, IKKE kørt automatisk.
-- ==================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ------------------------------------------------------------------
-- faste_punkter — administreres direkte i Supabase, ingen UI i v1
-- ------------------------------------------------------------------
create table faste_punkter (
  id            uuid primary key default gen_random_uuid(),
  titel         text not null,
  beskrivelse   text,
  raekkefoelge  int not null default 0,
  aktiv         boolean not null default true
);

-- ------------------------------------------------------------------
-- moeder
-- ------------------------------------------------------------------
create table moeder (
  id            uuid primary key default gen_random_uuid(),
  dato          date not null,
  starttid      time,
  status        text not null default 'planlagt'
                  check (status in ('planlagt','igang','afsluttet')),
  referent      text,
  deltagere     text[],
  oprettet_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- dagsordenspunkter
-- ------------------------------------------------------------------
create table dagsordenspunkter (
  id                  uuid primary key default gen_random_uuid(),
  moede_id            uuid not null references moeder(id) on delete cascade,
  titel               text not null,
  beskrivelse         text,
  kilde               text not null check (kilde in ('fast','indsendt','overfoert','ad_hoc')),
  fast_punkt_id       uuid references faste_punkter(id),
  foreslaaet_af       text,
  foreslaaet_at       timestamptz not null default now(),
  status              text not null default 'afventer'
                        check (status in ('afventer','godkendt','afvist','udsat')),
  afvist_begrundelse  text,
  raekkefoelge        int not null default 0,
  behandlet           boolean not null default false
);

create index dagsordenspunkter_moede_id_idx on dagsordenspunkter (moede_id);

-- ------------------------------------------------------------------
-- referat_noter — én række pr. punkt (unique på punkt_id), så
-- autosave kan bruge upsert(onConflict: 'punkt_id') hvert 10. sek.
-- ------------------------------------------------------------------
create table referat_noter (
  id            uuid primary key default gen_random_uuid(),
  punkt_id      uuid not null unique references dagsordenspunkter(id) on delete cascade,
  tekst         text,
  skrevet_af    text,
  oprettet_at   timestamptz not null default now(),
  opdateret_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- highlights
-- ------------------------------------------------------------------
create table highlights (
  id               uuid primary key default gen_random_uuid(),
  moede_id         uuid not null references moeder(id) on delete cascade,
  punkt_id         uuid not null references dagsordenspunkter(id) on delete cascade,
  type             text not null check (type in ('beslutning','opgave','info','til_naeste')),
  tekst            text not null,
  ansvarlig        text,
  deadline         date,
  status           text not null default 'aaben' check (status in ('aaben','loest')),
  vist_paa_skaerm  boolean not null default true,
  oprettet_at      timestamptz not null default now(),
  constraint opgave_kraever_ansvarlig check (type <> 'opgave' or ansvarlig is not null)
);

create index highlights_moede_id_idx on highlights (moede_id);
create index highlights_opgaver_idx on highlights (ansvarlig) where type = 'opgave';

-- ==================================================================
-- RLS
--
-- Der er IKKE et login/roller-system her (bekræftet med bruger:
-- medarbejdere skriver blot deres navn i felterne; "leder"-adgang er
-- en delt kode, gated client-side — samme mønster som ADMIN_KODE i
-- mollebakken-app-v2/index.html, som selv er kommenteret "kun et
-- menu-synligheds-gate, ikke reel sikkerhed").
--
-- Konsekvens: appen bruger udelukkende den offentlige anon-nøgle, og
-- RLS kan derfor IKKE skelne "leder" fra "medarbejder" — den kode-gate
-- håndhæves kun i JS/UI, ikke i databasen. Alle policies herunder er
-- derfor bevidst permissive (samme sikkerhedsniveau som resten af
-- systemet i dag). Hvis det senere skal håndhæves rigtigt, kræver det
-- Supabase Auth eller en Edge Function der validerer koden server-side
-- — ikke lavet nu, men nævnt så det ikke glemmes.
-- ==================================================================

alter table faste_punkter        enable row level security;
alter table moeder               enable row level security;
alter table dagsordenspunkter    enable row level security;
alter table referat_noter        enable row level security;
alter table highlights           enable row level security;

-- faste_punkter: kun læses af appen, redigeres direkte i Supabase
create policy "faste_punkter_select" on faste_punkter for select using (true);

-- moeder
create policy "moeder_select" on moeder for select using (true);
create policy "moeder_insert" on moeder for insert with check (true);
create policy "moeder_update" on moeder for update using (true) with check (true);

-- dagsordenspunkter
create policy "dagsordenspunkter_select" on dagsordenspunkter for select using (true);
create policy "dagsordenspunkter_insert" on dagsordenspunkter for insert with check (true);
create policy "dagsordenspunkter_update" on dagsordenspunkter for update using (true) with check (true);

-- referat_noter
create policy "referat_noter_select" on referat_noter for select using (true);
create policy "referat_noter_insert" on referat_noter for insert with check (true);
create policy "referat_noter_update" on referat_noter for update using (true) with check (true);

-- highlights
create policy "highlights_select" on highlights for select using (true);
create policy "highlights_insert" on highlights for insert with check (true);
create policy "highlights_update" on highlights for update using (true) with check (true);
create policy "highlights_delete" on highlights for delete using (true);

-- ==================================================================
-- MIGRATION — Fase 3 (2026-08-24)
-- Kun nødvendig hvis tabellerne ovenfor allerede er oprettet i Supabase
-- fra Fase 1. Tilføjer 'ad_hoc' som gyldig kilde, til punkter der dukker
-- op midt i mødet i moede.html (findes ikke i den oprindelige Fase 1-SQL).
-- ==================================================================

alter table dagsordenspunkter drop constraint if exists dagsordenspunkter_kilde_check;
alter table dagsordenspunkter add constraint dagsordenspunkter_kilde_check
  check (kilde in ('fast','indsendt','overfoert','ad_hoc'));
