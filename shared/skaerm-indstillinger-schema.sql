-- ==================================================================
-- skaerm_indstillinger — styrer infoskærm (personaletavle-v2) og
-- beboerskærm (personaleskaerm-v2). Morgen/aften-rotationen i
-- personaletavle-v2 forbliver hardkodet i JS — denne tabel styrer kun
-- NORMAL-rotationen (raekkefoelge/visningstid_sek) samt alle
-- beboerskærm-moduler (kun aktiv/inaktiv, fast layout).
-- Kør i Supabase SQL editor (projekt lumxvqhlmokspqnazhso, samme som
-- personaletavle-v2 / personaleskaerm-v2 / mollebakken-app-v2 /
-- personalemoede-v2). Vist til godkendelse 2026-09-23, IKKE kørt
-- automatisk.
-- ==================================================================

create table skaerm_indstillinger (
  id             uuid primary key default gen_random_uuid(),
  skaerm         text not null check (skaerm in ('infoskaerm','beboerskaerm')),
  noegle         text not null,
  aktiv          boolean not null default true,
  raekkefoelge   int,          -- kun infoskaerm (NORMAL-rotationens rækkefølge)
  visningstid_sek int,         -- kun infoskaerm (NORMAL-rotationens varighed)
  opdateret      timestamptz not null default now(),
  unique (skaerm, noegle)
);

-- ------------------------------------------------------------------
-- RLS — samme adgangsmodel som resten af systemet: ingen Supabase Auth,
-- så "kun admin må skrive" håndhæves i dag udelukkende af ADMIN_KODE i
-- browseren (se mollebakken-app-v2/index.html:490). RLS kan ikke skelne
-- admin fra almindelig bruger uden Auth, så policies er bevidst
-- permissive her, samme mønster som den eksisterende `indstillinger`-
-- tabel og personalemoede-v2's tabeller.
-- ------------------------------------------------------------------

alter table skaerm_indstillinger enable row level security;

create policy "skaerm_indstillinger_select" on skaerm_indstillinger for select using (true);
create policy "skaerm_indstillinger_insert" on skaerm_indstillinger for insert with check (true);
create policy "skaerm_indstillinger_update" on skaerm_indstillinger for update using (true) with check (true);

-- ------------------------------------------------------------------
-- Seed — matcher nuværende adfærd 1:1, intet ændrer sig ved udrulning.
-- Afkrydsning/overlap er skjult i dag (fjernet fra nav/rotation) og
-- sættes derfor til aktiv=false, ikke true. pmoede sættes til
-- aktiv=false indtil Fase 4 har bygget selve fanen i personaletavle-v2
-- — ellers ville rotationen prøve at vise et element der ikke findes.
-- ------------------------------------------------------------------

insert into skaerm_indstillinger (skaerm, noegle, aktiv, raekkefoelge, visningstid_sek) values
  ('infoskaerm', 'beskeder',    true,  0, 30),
  ('infoskaerm', 'ugeplaner',   true,  1, 30),
  ('infoskaerm', 'afkrydsning', false, 2, 30),
  ('infoskaerm', 'overlap',     false, 3, 30),
  ('infoskaerm', 'pmoede',      false, 4, 30);

insert into skaerm_indstillinger (skaerm, noegle, aktiv) values
  ('beboerskaerm', 'niveau1',   true),
  ('beboerskaerm', 'niveau2',   true),
  ('beboerskaerm', 'niveau3',   true),
  ('beboerskaerm', 'aftensmad', true),
  ('beboerskaerm', 'aktivitet', true),
  ('beboerskaerm', 'madplan',   true),
  ('beboerskaerm', 'vejr',      true);
