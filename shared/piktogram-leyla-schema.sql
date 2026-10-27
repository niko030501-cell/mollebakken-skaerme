-- ==================================================================
-- Piktogrammer til beboere (første beboer: Leyla) — database
-- STATUS: FORESLÅET. Må ikke køres før det er gennemset.
--
-- Princip: ALLE piktogram-tabeller peger på beboere.id (samme uuid som resten af
-- systemet: træning, beboer_sessions osv.). Så kan hele piktogram-delen senere
-- flyttes ind under Beboer uden at data skal omskrives.
--
-- Hvad filen gør, i almindeligt sprog:
--   1. Giver de fire eksisterende piktogram-tabeller en kolonne beboer_id og
--      lægger de nuværende data over på Leyla (se ANTAGELSE nedenfor).
--   2. Giver hvert piktogram en kontakt "vises for beboeren".
--   3. Opretter nye tabeller: kobling mellem ugeplanens aktiviteter og billeder,
--      beboerens egne Ja/Nej/Mere-billeder, og "hvem er med beboeren i dag".
--   4. Opretter to funktioner beboerens iPad må kalde:
--        beboer_pik_forside(token)  — LÆSER det beboeren skal se
--        beboer_pik_registrer(...)  — SKRIVER ét tryk på Ja/Nej/Mere
--      Intet andet kan iPad'en gøre. De nye tabeller har ingen åbne policies.
--   5. Rydder "med beboeren i dag" automatisk hver nat.
--
-- Bevidst IKKE med her (kommer i Del 2-4): admin-funktioner for personalet.
-- Bevidst IKKE rørt: de gamle policies på piktogram_*-tabellerne.
-- ==================================================================

-- ---------- 1. beboer_id på de eksisterende tabeller ----------
alter table public.piktogram_kategorier
  add column if not exists beboer_id uuid references public.beboere(id) on delete cascade;
alter table public.piktogram_piktogrammer
  add column if not exists beboer_id uuid references public.beboere(id) on delete cascade;
alter table public.piktogram_faste_valg
  add column if not exists beboer_id uuid references public.beboere(id) on delete cascade;
alter table public.piktogram_valg_registreringer
  add column if not exists beboer_id uuid references public.beboere(id) on delete set null;  -- journal bevares, hvis beboer slettes

-- ANTAGELSE (bekræft før kørsel): alle eksisterende rækker er Leylas.
-- Beboer-id for Leyla: 0bd80a40-4dd9-4567-bc5b-b0f510620aea
update public.piktogram_kategorier           set beboer_id = '0bd80a40-4dd9-4567-bc5b-b0f510620aea' where beboer_id is null;
update public.piktogram_piktogrammer         set beboer_id = '0bd80a40-4dd9-4567-bc5b-b0f510620aea' where beboer_id is null;
update public.piktogram_faste_valg           set beboer_id = '0bd80a40-4dd9-4567-bc5b-b0f510620aea' where beboer_id is null;
update public.piktogram_valg_registreringer  set beboer_id = '0bd80a40-4dd9-4567-bc5b-b0f510620aea' where beboer_id is null;
-- Kolonnerne forbliver nullable indtil den gamle piktogram-app er udfaset
-- (den kender ikke beboer_id og ville ellers fejle ved indsæt).

create index if not exists piktogram_kategorier_beboer_idx   on public.piktogram_kategorier (beboer_id);
create index if not exists piktogram_piktogrammer_beboer_idx on public.piktogram_piktogrammer (beboer_id);
create index if not exists piktogram_faste_valg_beboer_idx   on public.piktogram_faste_valg (beboer_id);
create index if not exists piktogram_reg_beboer_idx          on public.piktogram_valg_registreringer (beboer_id, tidspunkt desc);

-- ---------- 2. Kontakt: vises for beboeren ----------
alter table public.piktogram_piktogrammer
  add column if not exists vises_for_beboer boolean not null default true;

-- Registreringer: type (valgte / ingen-respons / andet / ja / nej / mere).
alter table public.piktogram_valg_registreringer
  add column if not exists type text;

-- Faste valg skal have 2-4 billeder (not valid: tabellen er tom, gamle rækker tvinges ikke).
alter table public.piktogram_faste_valg drop constraint if exists piktogram_faste_valg_antal;
alter table public.piktogram_faste_valg
  add constraint piktogram_faste_valg_antal
  check (cardinality(piktogram_ids) between 2 and 4) not valid;

-- ---------- 3. Nye tabeller (alle med beboer_id) ----------

-- Kobling: ugeplanens aktivitet -> ét billede ELLER ét fast valg. Gælder alle dage.
-- Ugeplanen gemmer beboerens NAVN, så aktivitet matches via navnet fra beboere.
create table if not exists public.piktogram_aktivitet_kobling (
  id            uuid primary key default gen_random_uuid(),
  beboer_id     uuid not null references public.beboere(id) on delete cascade,
  aktivitet     text not null,                       -- som i ugeplaner.aktivitet
  piktogram_id  uuid references public.piktogram_piktogrammer(id) on delete cascade,
  fast_valg_id  uuid references public.piktogram_faste_valg(id) on delete cascade,
  unique (beboer_id, aktivitet),
  check (num_nonnulls(piktogram_id, fast_valg_id) = 1)
);

-- Beboerens egne billeder til Ja / Nej / Mere (null = standardsymbol i appen).
create table if not exists public.piktogram_beboer_indstillinger (
  beboer_id         uuid primary key references public.beboere(id) on delete cascade,
  ja_piktogram_id   uuid references public.piktogram_piktogrammer(id) on delete set null,
  nej_piktogram_id  uuid references public.piktogram_piktogrammer(id) on delete set null,
  mere_piktogram_id uuid references public.piktogram_piktogrammer(id) on delete set null
);

-- Hvem er med beboeren i dag. Navn og foto er kopieret fra personaleskaerm_vagter.
create table if not exists public.piktogram_med_beboer (
  id        uuid primary key default gen_random_uuid(),
  beboer_id uuid not null references public.beboere(id) on delete cascade,
  dato      date not null,
  vagt_id   uuid,
  navn      text not null,
  billede   text,
  start_tid time not null,
  slut_tid  time not null
);
create index if not exists piktogram_med_beboer_idx on public.piktogram_med_beboer (beboer_id, dato);

-- ---------- RLS: slået til, ingen policies, ingen direkte rettigheder ----------
alter table public.piktogram_aktivitet_kobling      enable row level security;
alter table public.piktogram_beboer_indstillinger   enable row level security;
alter table public.piktogram_med_beboer             enable row level security;
revoke all on public.piktogram_aktivitet_kobling,
              public.piktogram_beboer_indstillinger,
              public.piktogram_med_beboer from anon, authenticated, public;

-- ---------- 4a. Læs: alt beboeren skal se (kun egne data via token) ----------
create or replace function public.beboer_pik_forside(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);   -- afviser ugyldig token
  v_navn text;
  v_idag date := (now() at time zone 'Europe/Copenhagen')::date;
  v_ind piktogram_beboer_indstillinger%rowtype;
begin
  select navn into v_navn from beboere where id = v_beboer;
  select * into v_ind from piktogram_beboer_indstillinger where beboer_id = v_beboer;

  return jsonb_build_object(
    'navn', v_navn,
    'dato', v_idag,
    'kategorier', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'navn', k.navn, 'farve', k.farve,
               'piktogrammer', coalesce((
                 select jsonb_agg(jsonb_build_object('id', p.id, 'navn', p.navn, 'sti', p.billede_path)
                                  order by p.raekkefolge, p.navn)
                   from piktogram_piktogrammer p
                  where p.kategori_id = k.id and p.beboer_id = v_beboer and p.slettet is null
                    and p.vises_for_beboer and p.billede_path is not null), '[]'::jsonb))
             order by k.raekkefolge, k.navn)
        from piktogram_kategorier k where k.beboer_id = v_beboer and k.slettet is null), '[]'::jsonb),
    'ugeplan', coalesce((
      select jsonb_agg(jsonb_build_object('ugedag', ugedag, 'tid', tid, 'aktivitet', aktivitet))
        from ugeplaner where beboer = v_navn), '[]'::jsonb),
    'koblinger', coalesce((
      select jsonb_object_agg(aktivitet, jsonb_build_object('piktogram_id', piktogram_id, 'fast_valg_id', fast_valg_id))
        from piktogram_aktivitet_kobling where beboer_id = v_beboer), '{}'::jsonb),
    'faste_valg', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'sporgsmaal', sporgsmaal, 'piktogram_ids', piktogram_ids))
        from piktogram_faste_valg where beboer_id = v_beboer and slettet is null), '[]'::jsonb),
    -- billeder brugt af koblinger/valg/Ja-Nej-Mere, også hvis de er skjult i gitteret
    'alle_billeder', coalesce((
      select jsonb_object_agg(p.id, jsonb_build_object('navn', p.navn, 'sti', p.billede_path,
               'farve', (select farve from piktogram_kategorier k where k.id = p.kategori_id)))
        from piktogram_piktogrammer p
       where p.beboer_id = v_beboer and p.slettet is null and p.billede_path is not null), '{}'::jsonb),
    'ja_nej_mere', jsonb_build_object(
      'ja', v_ind.ja_piktogram_id, 'nej', v_ind.nej_piktogram_id, 'mere', v_ind.mere_piktogram_id),
    'med_dig', coalesce((
      select jsonb_agg(jsonb_build_object('navn', navn, 'billede', billede,
               'start', to_char(start_tid, 'HH24:MI'), 'slut', to_char(slut_tid, 'HH24:MI'))
               order by start_tid)
        from piktogram_med_beboer where beboer_id = v_beboer and dato = v_idag), '[]'::jsonb)
  );
end;
$$;

-- ---------- 4b. Skriv: ét tryk på Ja / Nej / Mere ----------
create or replace function public.beboer_pik_registrer(p_token text, p_type text, p_tidspunkt bigint)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_beboer uuid := _beboer_fra_token(p_token);
begin
  if p_type not in ('ja', 'nej', 'mere') then
    raise exception 'ugyldig type';
  end if;
  insert into piktogram_valg_registreringer (id, tidspunkt, tilbudt, fast_valg_navn, svar, beboer_id, type)
  values (gen_random_uuid(), coalesce(p_tidspunkt, (extract(epoch from now()) * 1000)::bigint),
          '{}', null, jsonb_build_object('type', p_type), v_beboer, p_type);
end;
$$;

revoke execute on function public.beboer_pik_forside(text), public.beboer_pik_registrer(text, text, bigint) from public;
grant  execute on function public.beboer_pik_forside(text), public.beboer_pik_registrer(text, text, bigint) to anon, authenticated;

-- ---------- 5. Privatliv: ryd "med beboeren" fra tidligere dage hver nat ----------
select cron.schedule('ryd-pik-med-beboer', '5 0 * * *', $job$
  delete from public.piktogram_med_beboer
   where dato < (now() at time zone 'Europe/Copenhagen')::date;
$job$);

-- ---------- 6. Billeder ----------
-- Bucketten piktogram-billeder er privat og kan kun læses med Supabase-login, som iPad'en
-- ikke har. BESLUTNING TIL DIG:
--   a) Gør bucketten offentlig-læsbar (filnavne er uuid'er, generiske piktogrammer).
--   b) Behold privat og lav en edge function der udleverer billeder mod token.
-- Valgt: a) (godkendt af brugeren).
update storage.buckets set public = true where id = 'piktogram-billeder';
