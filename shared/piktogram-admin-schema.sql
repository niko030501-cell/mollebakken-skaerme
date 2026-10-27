-- ==================================================================
-- Piktogram-admin (Del 2): funktioner personalet bruger til at styre billeder,
-- kategorier og koblingen mellem ugeplanens aktiviteter og billeder.
--
-- Alle funktioner kræver en gyldig personale-token (samme login som Træning).
-- Alle er pr. beboer (p_beboer_id = beboere.id), så de kan flyttes ind under Beboer.
-- Intet slettes for godt: billeder og kategorier markeres som slettet (slettet = now()).
-- Kræver: shared/piktogram-leyla-schema.sql er kørt først.
-- ==================================================================

-- Alt admin-skærmen skal bruge i ét kald.
create or replace function public.personale_pik_hent(p_token text, p_beboer_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text;
begin
  perform _personale_tjek_token(p_token);
  select navn into v_navn from beboere where id = p_beboer_id;
  return jsonb_build_object(
    'beboer_navn', v_navn,
    'kategorier', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'farve', farve) order by raekkefolge, navn)
        from piktogram_kategorier where beboer_id = p_beboer_id and slettet is null), '[]'::jsonb),
    'piktogrammer', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'kategori_id', kategori_id,
               'sti', billede_path, 'vises', vises_for_beboer) order by raekkefolge, navn)
        from piktogram_piktogrammer where beboer_id = p_beboer_id and slettet is null), '[]'::jsonb),
    'aktiviteter', coalesce((
      select jsonb_agg(jsonb_build_object('aktivitet', u.aktivitet, 'antal', u.antal,
               'piktogram_id', k.piktogram_id, 'fast_valg_id', k.fast_valg_id) order by u.foerste, u.aktivitet)
        from (select aktivitet, count(*) antal,
                     min((split_part(tid, ':', 1)::int * 60) + split_part(tid, ':', 2)::int) foerste
                from ugeplaner where beboer = v_navn group by aktivitet) u
        left join piktogram_aktivitet_kobling k on k.beboer_id = p_beboer_id and k.aktivitet = u.aktivitet), '[]'::jsonb),
    'faste_valg', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'navn', navn, 'sporgsmaal', sporgsmaal, 'piktogram_ids', piktogram_ids)
               order by raekkefolge, navn)
        from piktogram_faste_valg where beboer_id = p_beboer_id and slettet is null), '[]'::jsonb)
  );
end;
$$;

-- Opret (p_id null) eller ret en kategori.
create or replace function public.personale_pik_kategori_gem(
  p_token text, p_beboer_id uuid, p_id uuid, p_navn text, p_farve text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
begin
  perform _personale_tjek_token(p_token);
  if btrim(coalesce(p_navn, '')) = '' or length(p_navn) > 40 then raise exception 'ugyldigt navn'; end if;
  if p_farve !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'ugyldig farve'; end if;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into piktogram_kategorier (id, navn, farve, raekkefolge, beboer_id)
    values (v_id, btrim(p_navn), p_farve,
            coalesce((select max(raekkefolge) + 1 from piktogram_kategorier where beboer_id = p_beboer_id and slettet is null), 0),
            p_beboer_id);
  else
    update piktogram_kategorier set navn = btrim(p_navn), farve = p_farve
     where id = v_id and beboer_id = p_beboer_id and slettet is null;
    if not found then raise exception 'kategorien findes ikke'; end if;
  end if;
  return v_id;
end;
$$;

-- Slet en kategori med alle dens billeder (markeres som slettet) og fjern deres koblinger.
create or replace function public.personale_pik_kategori_slet(p_token text, p_beboer_id uuid, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ider uuid[];
begin
  perform _personale_tjek_token(p_token);
  select coalesce(array_agg(id), '{}') into v_ider from piktogram_piktogrammer
   where kategori_id = p_id and beboer_id = p_beboer_id and slettet is null;
  perform _pik_fjern_brug(p_beboer_id, v_ider);
  update piktogram_piktogrammer set slettet = now() where id = any(v_ider);
  update piktogram_kategorier set slettet = now() where id = p_id and beboer_id = p_beboer_id;
end;
$$;

-- Intern: fjerner billeder fra koblinger, faste valg og Ja/Nej/Mere når de slettes.
create or replace function public._pik_fjern_brug(p_beboer_id uuid, p_ider uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(array_length(p_ider, 1), 0) = 0 then return; end if;
  delete from piktogram_aktivitet_kobling where beboer_id = p_beboer_id and piktogram_id = any(p_ider);
  update piktogram_faste_valg
     set piktogram_ids = (select coalesce(array_agg(x), '{}') from unnest(piktogram_ids) x where x <> all(p_ider))
   where beboer_id = p_beboer_id and piktogram_ids && p_ider;
  update piktogram_beboer_indstillinger set
     ja_piktogram_id   = case when ja_piktogram_id   = any(p_ider) then null else ja_piktogram_id end,
     nej_piktogram_id  = case when nej_piktogram_id  = any(p_ider) then null else nej_piktogram_id end,
     mere_piktogram_id = case when mere_piktogram_id = any(p_ider) then null else mere_piktogram_id end
   where beboer_id = p_beboer_id;
end;
$$;

-- Tilføj mange billeder på én gang. p_liste = [{navn, kategori_id, billede_path}, ...]
create or replace function public.personale_pik_tilfoej(p_token text, p_beboer_id uuid, p_liste jsonb)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  n integer := 0;
begin
  perform _personale_tjek_token(p_token);
  for r in select * from jsonb_array_elements(p_liste) loop
    if btrim(coalesce(r->>'navn', '')) = '' or length(r->>'navn') > 60 then raise exception 'ugyldigt navn'; end if;
    if (r->>'billede_path') !~ '^piktogrammer/[0-9a-f-]{36}\.jpg$' then raise exception 'ugyldigt billede'; end if;
    if not exists (select 1 from piktogram_kategorier
                    where id = (r->>'kategori_id')::uuid and beboer_id = p_beboer_id and slettet is null) then
      raise exception 'kategorien findes ikke';
    end if;
    insert into piktogram_piktogrammer (id, navn, kategori_id, billede_path, raekkefolge, oprettet, beboer_id, vises_for_beboer)
    values (gen_random_uuid(), btrim(r->>'navn'), (r->>'kategori_id')::uuid, r->>'billede_path',
            coalesce((select max(raekkefolge) + 1 from piktogram_piktogrammer
                       where kategori_id = (r->>'kategori_id')::uuid and slettet is null), 0),
            (extract(epoch from now()) * 1000)::bigint, p_beboer_id, true);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Ret et billede: navn, kategori, billedfil og/eller om det vises. Tomme felter (null) ændres ikke.
create or replace function public.personale_pik_ret(
  p_token text, p_beboer_id uuid, p_id uuid,
  p_navn text, p_kategori_id uuid, p_billede_path text, p_vises boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  p piktogram_piktogrammer%rowtype;
begin
  perform _personale_tjek_token(p_token);
  select * into p from piktogram_piktogrammer where id = p_id and beboer_id = p_beboer_id and slettet is null;
  if p.id is null then raise exception 'billedet findes ikke'; end if;
  if p_navn is not null and (btrim(p_navn) = '' or length(p_navn) > 60) then raise exception 'ugyldigt navn'; end if;
  if p_billede_path is not null and p_billede_path !~ '^piktogrammer/[0-9a-f-]{36}\.jpg$' then raise exception 'ugyldigt billede'; end if;
  if p_kategori_id is not null and p_kategori_id <> p.kategori_id then
    if not exists (select 1 from piktogram_kategorier where id = p_kategori_id and beboer_id = p_beboer_id and slettet is null) then
      raise exception 'kategorien findes ikke';
    end if;
    update piktogram_piktogrammer set kategori_id = p_kategori_id,
           raekkefolge = coalesce((select max(raekkefolge) + 1 from piktogram_piktogrammer
                                    where kategori_id = p_kategori_id and slettet is null), 0)
     where id = p_id;
  end if;
  update piktogram_piktogrammer set
         navn = coalesce(btrim(p_navn), navn),
         billede_path = coalesce(p_billede_path, billede_path),
         vises_for_beboer = coalesce(p_vises, vises_for_beboer)
   where id = p_id;
end;
$$;

create or replace function public.personale_pik_slet(p_token text, p_beboer_id uuid, p_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  perform _pik_fjern_brug(p_beboer_id, array[p_id]);
  update piktogram_piktogrammer set slettet = now() where id = p_id and beboer_id = p_beboer_id;
end;
$$;

-- Ny rækkefølge: p_ider i den ønskede rækkefølge. p_hvad = 'kategorier' eller 'piktogrammer'.
create or replace function public.personale_pik_raekkefoelge(p_token text, p_beboer_id uuid, p_hvad text, p_ider uuid[])
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  if p_hvad = 'kategorier' then
    update piktogram_kategorier k set raekkefolge = o.n - 1
      from unnest(p_ider) with ordinality o(id, n)
     where k.id = o.id and k.beboer_id = p_beboer_id;
  elsif p_hvad = 'piktogrammer' then
    update piktogram_piktogrammer k set raekkefolge = o.n - 1
      from unnest(p_ider) with ordinality o(id, n)
     where k.id = o.id and k.beboer_id = p_beboer_id;
  else
    raise exception 'ugyldig type';
  end if;
end;
$$;

-- Kobling: aktivitet -> billede ELLER fast valg. Begge tomme = fjern koblingen.
-- Gælder alle dage, fordi den er pr. aktivitetsnavn.
create or replace function public.personale_pik_kobling_saet(
  p_token text, p_beboer_id uuid, p_aktivitet text, p_piktogram_id uuid, p_fast_valg_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  if p_piktogram_id is null and p_fast_valg_id is null then
    delete from piktogram_aktivitet_kobling where beboer_id = p_beboer_id and aktivitet = p_aktivitet;
    return;
  end if;
  if p_piktogram_id is not null and p_fast_valg_id is not null then raise exception 'vælg enten billede eller fast valg'; end if;
  if p_piktogram_id is not null and not exists (
       select 1 from piktogram_piktogrammer where id = p_piktogram_id and beboer_id = p_beboer_id and slettet is null) then
    raise exception 'billedet findes ikke';
  end if;
  if p_fast_valg_id is not null and not exists (
       select 1 from piktogram_faste_valg where id = p_fast_valg_id and beboer_id = p_beboer_id and slettet is null) then
    raise exception 'det faste valg findes ikke';
  end if;
  insert into piktogram_aktivitet_kobling (beboer_id, aktivitet, piktogram_id, fast_valg_id)
  values (p_beboer_id, p_aktivitet, p_piktogram_id, p_fast_valg_id)
  on conflict (beboer_id, aktivitet)
  do update set piktogram_id = excluded.piktogram_id, fast_valg_id = excluded.fast_valg_id;
end;
$$;

revoke execute on function
  public.personale_pik_hent(text, uuid),
  public.personale_pik_kategori_gem(text, uuid, uuid, text, text),
  public.personale_pik_kategori_slet(text, uuid, uuid),
  public._pik_fjern_brug(uuid, uuid[]),
  public.personale_pik_tilfoej(text, uuid, jsonb),
  public.personale_pik_ret(text, uuid, uuid, text, uuid, text, boolean),
  public.personale_pik_slet(text, uuid, uuid),
  public.personale_pik_raekkefoelge(text, uuid, text, uuid[]),
  public.personale_pik_kobling_saet(text, uuid, text, uuid, uuid)
  from public;
grant execute on function
  public.personale_pik_hent(text, uuid),
  public.personale_pik_kategori_gem(text, uuid, uuid, text, text),
  public.personale_pik_kategori_slet(text, uuid, uuid),
  public.personale_pik_tilfoej(text, uuid, jsonb),
  public.personale_pik_ret(text, uuid, uuid, text, uuid, text, boolean),
  public.personale_pik_slet(text, uuid, uuid),
  public.personale_pik_raekkefoelge(text, uuid, text, uuid[]),
  public.personale_pik_kobling_saet(text, uuid, text, uuid, uuid)
  to anon, authenticated;
-- _pik_fjern_brug er intern og får ingen grant.
