-- ============================================================
-- skjult_personale — rent VISNINGSFILTER for beboerskærmen
-- (personaleskaerm-v2). Styres fra mollebakken-app-v2.
--
-- Rører IKKE personaleskaerm_vagter eller workfeed-sync: sync'en tømmer
-- og genskriver kun sin egen tabel hvert 15. min, og vagt-id'er er derfor
-- ikke stabile — en skjulning peger på personen via NAVN + DAG i stedet.
--
-- Én række = "vis ikke <navn> på beboerskærmens liste for <dag>".
--   dag       — den listedag skjulningen gælder (samme dato som skærmen
--               viser; efter 19:30 er det morgendagens liste).
--   udloeber  — beregnes i appen: midnat efter <dag>, eller slutningen af
--               personens vagt hvis den fortsætter over midnat (døgn-/
--               nattevagt splittes i to rækker ved midnat af Workfeed).
--   aarsag    — fast valg, ingen fritekst. Vises kun i appen, aldrig på
--               skærmen. Rækker slettes automatisk efter udløb (se cron).
-- ============================================================

create table if not exists skjult_personale (
  id        uuid primary key default gen_random_uuid(),
  navn      text not null,
  dag       date not null,
  udloeber  timestamptz not null,
  aarsag    text check (aarsag in ('syg', 'hensyn', 'andet')),
  oprettet  timestamptz not null default now(),
  unique (navn, dag)
);

alter table skjult_personale enable row level security;

-- Samme åbne sikkerhedsmodel som resten af appen (anon-nøglen, ingen
-- Supabase Auth). Kun læs/opret/slet — ingen opdatering nødvendig
-- ("Vis igen" = slet rækken).
create policy "anon_read"   on skjult_personale for select to anon using (true);
create policy "anon_insert" on skjult_personale for insert to anon with check (true);
create policy "anon_delete" on skjult_personale for delete to anon using (true);
create policy "auth_all"    on skjult_personale for all to authenticated using (true) with check (true);

-- Oprydning: udløbne skjulninger (og deres årsag) gemmes ikke længere end
-- nødvendigt. Kører hver nat kl. 03:15 (UTC, se README om tidszoner).
select cron.schedule('ryd-skjult-personale', '15 3 * * *',
  $$delete from skjult_personale where udloeber < now()$$);

-- Appens nye "Skærm"-fane kan slås til/fra under Admin → Synlige faner.
insert into indstillinger (fane, aktiv)
select 'skaerm', true
where not exists (select 1 from indstillinger where fane = 'skaerm');
