-- ====================================================================
-- Træning — personalet kan oprette, rette og skjule egne øvelser
-- (bygger oven på shared/beboer-traening-schema.sql)
--
-- KØRES MANUELT i Supabase SQL Editor. Kan køres flere gange (idempotent).
--
-- Indhold
--   1. kategori-tjekket udvides med 'maskine'
--   2. ovelser.oprettet_af_personale (false for de 26 startøvelser)
--   3. Storage-bucket 'ovelse-billeder' (offentlig læsning, 5 MB, jpg/png/webp)
--      Bucket'en har BEVIDST ingen policies på storage.objects: upload sker kun
--      via en signeret URL fra edge-funktionen `ovelse-billede`
--      (shared/ovelse-billede-edge-function.ts), som tjekker personale-token.
--   4. personale_opret_ovelse / personale_ret_ovelse / personale_skjul_ovelse
--   5. personale_hent_ovelser udvides med p_inkl_skjulte (default false =
--      uændret adfærd for programbyggeren)
--
-- Regler
--   * Alle skrivninger går gennem funktioner med personale-token.
--   * Ingen rigtig sletning: skjulte øvelser forbliver i eksisterende
--     programmer og i træningsloggen.
--   * Kun øvelser personalet selv har lavet kan rettes (de 26 kan skjules).
--   * Billedstier skal enten være en eksisterende sti i repoet
--     (beboer-v2/ovelser/….jpg) eller en URL i vores egen bucket. Fremmede
--     URL'er afvises, så de aldrig kan ende i beboerappen.
-- ====================================================================

begin;

-- ---------- 1. Ny kategori: maskine ----------

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.ovelser'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%kategori%'
  loop
    execute format('alter table public.ovelser drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.ovelser
  add constraint ovelser_kategori_check
  check (kategori in ('led','styrke','straek','balance','cardio','maskine'));

-- ---------- 2. Hvem har lavet øvelsen ----------

alter table public.ovelser
  add column if not exists oprettet_af_personale boolean not null default false;

-- ---------- 3. Bucket til øvelsesbilleder ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ovelse-billeder', 'ovelse-billeder', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Interne hjælpere (ikke kaldbare udefra) ----------

-- Unik slug ud fra navnet: æøå translittereres, resten bliver til '-'.
create or replace function public._ovelse_slug(p_navn text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_basis text;
  v_slug text;
  n integer := 1;
begin
  v_basis := lower(btrim(coalesce(p_navn, '')));
  v_basis := replace(replace(replace(v_basis, 'æ', 'ae'), 'ø', 'oe'), 'å', 'aa');
  v_basis := regexp_replace(v_basis, '[^a-z0-9]+', '-', 'g');
  v_basis := btrim(v_basis, '-');
  if v_basis = '' then v_basis := 'ovelse'; end if;
  v_basis := left(v_basis, 50);
  v_slug := v_basis;
  while exists (select 1 from ovelser where slug = v_slug) loop
    n := n + 1;
    v_slug := v_basis || '-' || n;
  end loop;
  return v_slug;
end;
$$;

-- Tilladte billedstier: ingen, en eksisterende repo-sti, eller vores egen bucket.
create or replace function public._ovelse_billede_ok(p_sti text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_sti is null
      or p_sti ~ '^beboer-v2/ovelser/[a-z0-9._-]+\.jpg$'
      or p_sti ~ '^https://lumxvqhlmokspqnazhso\.supabase\.co/storage/v1/object/public/ovelse-billeder/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$';
$$;

-- ---------- 4. Opret, ret, skjul ----------

create or replace function public.personale_opret_ovelse(
  p_token text, p_navn text, p_beskrivelse text, p_kategori text,
  p_billede_sti text, p_billede2_sti text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text := btrim(coalesce(p_navn, ''));
  v_beskr text := btrim(coalesce(p_beskrivelse, ''));
  v_b1 text := nullif(btrim(coalesce(p_billede_sti, '')), '');
  v_b2 text := nullif(btrim(coalesce(p_billede2_sti, '')), '');
  v_id uuid;
begin
  perform _personale_tjek_token(p_token);
  if length(v_navn) < 1 or length(v_navn) > 60 then
    raise exception 'Navnet skal være mellem 1 og 60 tegn';
  end if;
  if length(v_beskr) > 300 then
    raise exception 'Beskrivelsen må højst være 300 tegn';
  end if;
  if p_kategori is null or p_kategori not in ('led','styrke','straek','balance','cardio','maskine') then
    raise exception 'Ukendt kategori';
  end if;
  if not _ovelse_billede_ok(v_b1) or not _ovelse_billede_ok(v_b2) then
    raise exception 'Ugyldig billedsti';
  end if;
  if v_b2 is not null and v_b1 is null then
    raise exception 'Tilføj det første billede før det andet';
  end if;

  insert into ovelser (slug, navn, beskrivelse, billede_sti, billede2_sti, kategori,
                       aktiv, sortering, kilde, oprettet_af_personale)
  values (_ovelse_slug(v_navn), v_navn, v_beskr, v_b1, v_b2, p_kategori,
          true, coalesce((select max(sortering) from ovelser), 0) + 10, 'personale', true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Kun øvelser personalet selv har lavet kan rettes. Sluggen ændres aldrig.
create or replace function public.personale_ret_ovelse(
  p_token text, p_ovelse_id uuid, p_navn text, p_beskrivelse text, p_kategori text,
  p_billede_sti text, p_billede2_sti text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text := btrim(coalesce(p_navn, ''));
  v_beskr text := btrim(coalesce(p_beskrivelse, ''));
  v_b1 text := nullif(btrim(coalesce(p_billede_sti, '')), '');
  v_b2 text := nullif(btrim(coalesce(p_billede2_sti, '')), '');
  v_antal integer;
begin
  perform _personale_tjek_token(p_token);
  if length(v_navn) < 1 or length(v_navn) > 60 then
    raise exception 'Navnet skal være mellem 1 og 60 tegn';
  end if;
  if length(v_beskr) > 300 then
    raise exception 'Beskrivelsen må højst være 300 tegn';
  end if;
  if p_kategori is null or p_kategori not in ('led','styrke','straek','balance','cardio','maskine') then
    raise exception 'Ukendt kategori';
  end if;
  if not _ovelse_billede_ok(v_b1) or not _ovelse_billede_ok(v_b2) then
    raise exception 'Ugyldig billedsti';
  end if;
  if v_b2 is not null and v_b1 is null then
    raise exception 'Tilføj det første billede før det andet';
  end if;

  update ovelser
     set navn = v_navn, beskrivelse = v_beskr, kategori = p_kategori,
         billede_sti = v_b1, billede2_sti = v_b2
   where id = p_ovelse_id and oprettet_af_personale;
  get diagnostics v_antal = row_count;
  if v_antal = 0 then
    raise exception 'Øvelsen findes ikke, eller den kan ikke rettes';
  end if;
end;
$$;

-- Skjul/vis. Returnerer hvor mange AKTIVE programmer øvelsen indgår i
-- (de beholder den, så intet går i stykker).
create or replace function public.personale_skjul_ovelse(
  p_token text, p_ovelse_id uuid, p_aktiv boolean)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_antal integer;
  v_programmer integer;
begin
  perform _personale_tjek_token(p_token);
  if p_aktiv is null then
    raise exception 'Mangler aktiv/skjult';
  end if;
  update ovelser set aktiv = p_aktiv where id = p_ovelse_id;
  get diagnostics v_antal = row_count;
  if v_antal = 0 then
    raise exception 'Øvelsen findes ikke';
  end if;
  select count(distinct po.program_id) into v_programmer
    from program_ovelser po
    join traeningsprogrammer p on p.id = po.program_id and p.aktiv
   where po.ovelse_id = p_ovelse_id;
  return jsonb_build_object('ok', true, 'programmer', v_programmer);
end;
$$;

-- ---------- 5. personale_hent_ovelser: valgfrit med skjulte ----------
-- Den gamle signatur (kun p_token) droppes, så der ikke opstår en overload.
-- Kald med kun p_token virker uændret (p_inkl_skjulte = false).

drop function if exists public.personale_hent_ovelser(text);

create or replace function public.personale_hent_ovelser(p_token text, p_inkl_skjulte boolean default false)
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
             'kategori', kategori, 'aktiv', aktiv,
             'oprettet_af_personale', oprettet_af_personale) order by sortering, navn)
      from ovelser
     where aktiv or coalesce(p_inkl_skjulte, false)), '[]'::jsonb);
end;
$$;

-- ---------- Rettigheder ----------

revoke execute on function
  public._ovelse_slug(text), public._ovelse_billede_ok(text)
  from public, anon, authenticated;

revoke execute on function
  public.personale_opret_ovelse(text, text, text, text, text, text),
  public.personale_ret_ovelse(text, uuid, text, text, text, text, text),
  public.personale_skjul_ovelse(text, uuid, boolean),
  public.personale_hent_ovelser(text, boolean)
  from public;

grant execute on function
  public.personale_opret_ovelse(text, text, text, text, text, text),
  public.personale_ret_ovelse(text, uuid, text, text, text, text, text),
  public.personale_skjul_ovelse(text, uuid, boolean),
  public.personale_hent_ovelser(text, boolean)
  to anon, authenticated;

commit;

-- ====================================================================
-- VALGFRIT: natlig oprydning af uploadede billeder der aldrig blev gemt
-- i en øvelse (fx hvis man fortryder). Kræver at edge-funktionen
-- `ovelse-billede` er deployet. Sæt anon-nøglen ind (samme som i appen) og
-- fjern kommentarerne. Springes over, hvis du ikke vil have det.
--
-- select cron.schedule('ryd-ovelse-billeder', '45 3 * * *', $$
--   select net.http_post(
--     url := 'https://lumxvqhlmokspqnazhso.supabase.co/functions/v1/ovelse-billede',
--     headers := '{"Authorization": "Bearer <ANON-NØGLE>", "Content-Type": "application/json"}'::jsonb,
--     body := '{"action":"ryd"}'::jsonb
--   );
-- $$);
-- ====================================================================
