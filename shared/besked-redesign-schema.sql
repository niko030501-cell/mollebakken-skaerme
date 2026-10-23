-- Besked-redesign (fase 2): nye felter til beskeder + sted på aktiviteter.
-- Additivt: ingen kolonner fjernes eller omdøbes, eksisterende rækker bevares.
-- Kan køres flere gange (if not exists / idempotente opdateringer).

-- ---------- beskeder ----------
alter table public.beskeder
  add column if not exists beboere        text[]  not null default '{}',   -- fx {Lars,Kenneth} eller {Huset}
  add column if not exists kategori       text    not null default 'info',
  add column if not exists titel          text,
  add column if not exists detalje        text,
  add column if not exists hvornaar_dato  date,                            -- valgfri: hvornår det sker
  add column if not exists hvornaar_tid   time,                            -- valgfri; gemmes uden tidszone (lokal tid)
  add column if not exists vigtig         boolean not null default false,
  add column if not exists fjernes_efter  timestamptz;                     -- null = "Bliv stående" (fast info)

alter table public.beskeder drop constraint if exists beskeder_kategori_check;
alter table public.beskeder add constraint beskeder_kategori_check
  check (kategori in ('sundhed','mad','aktivitet','besoeg','rutine','fest','koersel','info'));

-- Eksisterende beskeder: gamle felter oversættes, så intet går tabt.
--  * beboer 'Personale' -> Huset, ellers beboerens navn
--  * titel = den gamle beskedtekst
--  * Rød prioritet -> vigtig
--  * fjernes_efter forbliver null = fast info
update public.beskeder
set beboere = case when beboer = 'Personale' then array['Huset'] else array[beboer] end
where beboere = '{}';

update public.beskeder set titel = besked where titel is null;
update public.beskeder set vigtig = true where prioritet = 'Rød' and vigtig = false;

-- Oprettet-tidspunkt (til NY-mærket) genbruger eksisterende created_at.
-- Den gamle kolonne beboer (not null) beholdes og skrives fortsat af appen
-- (første beboer, eller 'Personale' for Huset), så tavlen virker indtil fase 8.

create index if not exists beskeder_aktiv_fjernes_idx on public.beskeder (aktiv, fjernes_efter);

-- ---------- aktiviteter ----------
alter table public.aktiviteter
  add column if not exists sted text;   -- "Hvor?" (valgfri)

-- Aktivitet (fase 7): klokkeslæt ("Kl."), valgfrit, fri tekst som "10:00".
alter table public.aktiviteter
  add column if not exists tid text;
