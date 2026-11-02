-- ============================================================
-- moededag_rettelser — personalets rettelser til hvem der er vikar /
-- kun til møde / fortsætter efter mødet på en mødedag.
-- Styres fra mollebakken-app-v2 (Admin → Mødedag) og læses af
-- beboerskærmen (personaleskaerm-v2). Sorteringsreglerne ligger i
-- shared/moededag.js, så app og skærm regner ens.
--
-- KØRES MANUELT i Supabase → SQL Editor (én gang). Ændrer ikke
-- personaleskaerm_vagter eller workfeed-sync.
--
-- Én række = "<navn> skal i bunken <bunke> den <dato>". Kun de personer
-- brugeren SELV har flyttet gemmes; alle andre sorteres stadig automatisk
-- (Vikar-tag + skiftetidspunkt), også når skiftetidspunktet ændrer sig.
--   dato     — den dag rettelsen gælder (samme dato som skærmen viser).
--   navn     — Workfeed-navnet. Workfeed-tabellens vagt-id'er er ikke
--              stabile (tabellen genskrives hvert 15. min) og indeholder
--              intet medarbejder-id, så der peges på NAVN + DATO, som i
--              skjult_personale.
--   bunke    — vikar | kun_til_moede | fortsaetter | normal
--              eller ingen_moededag (navn '*'): "Det er ikke en mødedag".
--   rettet_af_bruger — altid true for rækker appen skriver (rækker er kun
--              rettelser); kolonnen gør det synligt i databasen.
-- ============================================================

create table if not exists moededag_rettelser (
  id                uuid primary key default gen_random_uuid(),
  dato              date not null,
  navn              text not null,
  bunke             text not null
                    check (bunke in ('vikar', 'kun_til_moede', 'fortsaetter', 'normal', 'ingen_moededag')),
  rettet_af_bruger  boolean not null default true,
  opdateret         timestamptz not null default now(),
  unique (dato, navn)
);

alter table moededag_rettelser enable row level security;

-- Samme åbne sikkerhedsmodel som resten af appen (anon-nøglen, ingen
-- Supabase Auth); adgangen til siden styres af Admin-koden i appen.
create policy "anon_read"   on moededag_rettelser for select to anon using (true);
create policy "anon_insert" on moededag_rettelser for insert to anon with check (true);
create policy "anon_update" on moededag_rettelser for update to anon using (true) with check (true);
create policy "anon_delete" on moededag_rettelser for delete to anon using (true);
create policy "auth_all"    on moededag_rettelser for all to authenticated using (true) with check (true);

create index if not exists moededag_rettelser_dato_idx on moededag_rettelser (dato);

-- Oprydning: rettelser for dage der er mere end en uge gamle slettes.
-- Kører hver nat kl. 03:20 (UTC, se README om tidszoner).
select cron.schedule('ryd-moededag-rettelser', '20 3 * * *',
  $$delete from moededag_rettelser where dato < current_date - 7$$);
