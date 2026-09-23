-- ==================================================================
-- Emner (overskrifter man kan gruppere dagsordenspunkter under, fx
-- "Nyt fra Møllebakken") — punkter kan også stadig stå helt for sig
-- selv uden emne. Både emner og enkelte punkter kan have en valgfri,
-- informativ varighed ("må vare X minutter") — ingen aktiv nedtælling,
-- det er kun Pause-funktionen der har det.
--
-- `aktiv` er en "blød sletning" for emner, samme princip som punkternes
-- status='afvist' — der findes ingen slette-tilladelse (RLS) på nogen
-- tabel i dette system, så "Slet emne" sætter aktiv=false i stedet for
-- at fjerne rækken. Punkter under et slettet emne bliver ikke slettet,
-- de kan stadig ses/redigeres, bare ikke under en synlig overskrift.
--
-- Kør i Supabase SQL editor. Vist til godkendelse 2026-09-23, IKKE
-- kørt automatisk.
-- ==================================================================

create table emner (
  id                uuid primary key default gen_random_uuid(),
  moede_id          uuid not null references moeder(id) on delete cascade,
  titel             text not null,
  varighed_minutter int,
  raekkefoelge      int not null default 0,
  aktiv             boolean not null default true,
  oprettet_at       timestamptz not null default now()
);

alter table emner enable row level security;

-- Samme permissive model som resten af systemet (se
-- leder-godkendelse-rpc.sql for baggrunden — ingen Supabase Auth).
create policy "emner_select" on emner for select using (true);
create policy "emner_insert" on emner for insert with check (true);
create policy "emner_update" on emner for update using (true) with check (true);

-- emne_id: sat hvis punktet hører under et emne, null hvis det står
-- for sig selv. "on delete set null" i stedet for cascade — forsvinder
-- et emne, skal dets punkter ikke forsvinde med, bare blive løse igen.
alter table dagsordenspunkter add column emne_id uuid references emner(id) on delete set null;
alter table dagsordenspunkter add column varighed_minutter int;
