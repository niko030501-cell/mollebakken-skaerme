-- ==================================================================
-- LA2 (Møllebakken) — tabeller, RLS, triggers og skærm-feed.
-- Projekt: lumxvqhlmokspqnazhso (samme som resten af systemet).
-- STATUS: skrevet til godkendelse, IKKE kørt.
--
-- Sikkerhedsmodel:
--   * anon har INGEN adgang til noget LA2-relateret (grants revoked + ingen policies).
--   * Rollen læses fra JWT'ens app_metadata.la2_role ('editor' | 'screen').
--     app_metadata kan kun sættes server-side — ikke af brugeren selv.
--   * editor: select/insert/update på LA2-tabeller. Aldrig delete.
--   * screen: ingen adgang til tabellerne. Kun la2_screen_feed() (metadata, aldrig indhold).
--   * Planer slettes ikke — de arkiveres (status = 'arkiv').
--   * Eksisterende tabeller røres IKKE.
-- ==================================================================


-- ------------------------------------------------------------------
-- 0. Hjælpefunktion: LA2-rollen fra JWT (tom streng hvis ingen)
-- ------------------------------------------------------------------
create or replace function public.la2_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'la2_role', '')
$$;

create or replace function public.la2_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ------------------------------------------------------------------
-- 1. Tabeller
-- ------------------------------------------------------------------

-- Indstillinger pr. beboer
create table public.la2_residents (
  id              uuid primary key default gen_random_uuid(),
  resident_id     uuid not null unique references public.beboere(id),
  botilbud_id     uuid not null references public.facilities(id),
  variant         text not null default 'LA2' check (variant in ('LA2','LA2u')),
  contact_persons text not null default '',
  updated_at      timestamptz not null default now()
);

create trigger la2_residents_touch
  before update on public.la2_residents
  for each row execute function public.la2_touch_updated_at();

-- Medarbejderliste til "Hvem er du?"
create table public.la2_staff (
  id          uuid primary key default gen_random_uuid(),
  botilbud_id uuid not null references public.facilities(id),
  navn        text not null check (length(btrim(navn)) > 0),
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (botilbud_id, navn)
);

-- Planer
-- content        = den aktive/gemte version.
-- draft_content  = igangværende udkast oven på en AKTIV plan (null hvis intet).
--                  Så en aktiv plan ikke forsvinder fra infoskærmen, når nogen
--                  gemmer et udkast. Status 'udkast' = planen har aldrig været aktiv.
create table public.la2_plans (
  id               uuid primary key default gen_random_uuid(),
  resident_id      uuid not null references public.beboere(id),
  botilbud_id      uuid not null references public.facilities(id),
  plan_type        text not null check (plan_type in ('trivsel','tryghed','laering','mestring','haab_droem')),
  perspective      text not null check (perspective in ('min','din','fagprofessionel')),
  title            text not null default '',
  episode_date     date,
  episode_group_id uuid,                     -- kobler borger- og fagprofessionel-række for samme episode
  content          jsonb not null default '{}'::jsonb,
  draft_content    jsonb,
  filled_with      text not null default '',
  status           text not null default 'udkast' check (status in ('aktiv','udkast','arkiv')),
  review_months    int  not null default 3 check (review_months between 1 and 12),
  review_due       date,
  created_by_name  text not null check (length(btrim(created_by_name)) > 0),
  updated_by_name  text not null check (length(btrim(updated_by_name)) > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint la2_plans_laering_felter check (
    plan_type <> 'laering' or (episode_date is not null and episode_group_id is not null)
  )
);

-- Én levende plan pr. beboer/plantype/perspektiv (undtagen læring, som er pr. episode)
create unique index la2_plans_en_pr_type
  on public.la2_plans (resident_id, plan_type, perspective)
  where plan_type <> 'laering' and status <> 'arkiv';

create unique index la2_plans_en_pr_episode
  on public.la2_plans (episode_group_id, perspective)
  where plan_type = 'laering';

create index la2_plans_resident_idx on public.la2_plans (resident_id, plan_type);
create index la2_plans_updated_idx  on public.la2_plans (updated_at desc);

-- Versionshistorik (skrives KUN af triggeren — ingen direkte skrivning)
create table public.la2_plan_versions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.la2_plans(id),
  version_no     int  not null,
  title          text not null default '',
  content        jsonb not null,
  filled_with    text not null default '',
  status         text not null,
  is_draft       boolean not null default false,
  edited_by_name text not null,
  edited_at      timestamptz not null default now(),
  unique (plan_id, version_no)
);


-- ------------------------------------------------------------------
-- 2. Triggers på la2_plans
-- ------------------------------------------------------------------

-- BEFORE: botilbud fra la2_residents hvis ikke angivet, updated_at og revisionsfrist.
-- review_due flyttes frem (dato i dansk tid + review_months) når planens
-- indhold eller fristvalget ændres — IKKE når man blot gemmer et udkast
-- eller arkiverer.
create or replace function public.la2_plans_before()
returns trigger
language plpgsql
as $$
declare
  nu_dk date := (now() at time zone 'Europe/Copenhagen')::date;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.botilbud_id is null then
      select r.botilbud_id into new.botilbud_id
        from public.la2_residents r where r.resident_id = new.resident_id;
    end if;
    new.review_due := nu_dk + make_interval(months => new.review_months);
  else
    -- uforanderlige felter
    new.resident_id     := old.resident_id;
    new.botilbud_id     := old.botilbud_id;
    new.plan_type       := old.plan_type;
    new.perspective     := old.perspective;
    new.created_by_name := old.created_by_name;
    new.created_at      := old.created_at;

    if new.content is distinct from old.content
       or new.review_months is distinct from old.review_months then
      new.review_due := nu_dk + make_interval(months => new.review_months);
    else
      new.review_due := old.review_due;   -- frist kan ikke sættes direkte
    end if;
  end if;

  return new;
end;
$$;

create trigger la2_plans_before_trg
  before insert or update on public.la2_plans
  for each row execute function public.la2_plans_before();

-- AFTER: fuldt øjebliksbillede ved hver gemning. Security definer, så
-- editor ikke selv skal have INSERT på la2_plan_versions.
create or replace function public.la2_plans_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v int;
begin
  select coalesce(max(version_no), 0) + 1 into v
    from public.la2_plan_versions where plan_id = new.id;

  insert into public.la2_plan_versions
    (plan_id, version_no, title, content, filled_with, status, is_draft, edited_by_name, edited_at)
  values
    (new.id, v, new.title,
     coalesce(new.draft_content, new.content),
     new.filled_with, new.status,
     (new.draft_content is not null or new.status = 'udkast'),
     new.updated_by_name, new.updated_at);

  return new;
end;
$$;

create trigger la2_plans_snapshot_trg
  after insert or update on public.la2_plans
  for each row execute function public.la2_plans_snapshot();


-- ------------------------------------------------------------------
-- 3. RLS og grants
-- ------------------------------------------------------------------

alter table public.la2_residents      enable row level security;
alter table public.la2_staff          enable row level security;
alter table public.la2_plans          enable row level security;
alter table public.la2_plan_versions  enable row level security;

-- Supabase giver som standard alle rettigheder til anon/authenticated på nye
-- tabeller. Fjern dem eksplicit (ud over RLS) og giv kun det nødvendige tilbage.
revoke all on public.la2_residents, public.la2_staff, public.la2_plans, public.la2_plan_versions
  from public, anon, authenticated;

grant select, insert, update on public.la2_residents to authenticated;
grant select, insert, update on public.la2_staff     to authenticated;
grant select, insert, update on public.la2_plans     to authenticated;
grant select                 on public.la2_plan_versions to authenticated;
-- (ingen delete nogen steder; versioner skrives kun af triggeren)

-- Policies — kun editor. 'screen' har bevidst ingen policy på nogen tabel.
create policy la2_residents_sel on public.la2_residents for select to authenticated
  using ((select public.la2_role()) = 'editor');
create policy la2_residents_ins on public.la2_residents for insert to authenticated
  with check ((select public.la2_role()) = 'editor');
create policy la2_residents_upd on public.la2_residents for update to authenticated
  using ((select public.la2_role()) = 'editor')
  with check ((select public.la2_role()) = 'editor');

create policy la2_staff_sel on public.la2_staff for select to authenticated
  using ((select public.la2_role()) = 'editor');
create policy la2_staff_ins on public.la2_staff for insert to authenticated
  with check ((select public.la2_role()) = 'editor');
create policy la2_staff_upd on public.la2_staff for update to authenticated
  using ((select public.la2_role()) = 'editor')
  with check ((select public.la2_role()) = 'editor');

create policy la2_plans_sel on public.la2_plans for select to authenticated
  using ((select public.la2_role()) = 'editor');
create policy la2_plans_ins on public.la2_plans for insert to authenticated
  with check ((select public.la2_role()) = 'editor');
create policy la2_plans_upd on public.la2_plans for update to authenticated
  using ((select public.la2_role()) = 'editor')
  with check ((select public.la2_role()) = 'editor');

create policy la2_versions_sel on public.la2_plan_versions for select to authenticated
  using ((select public.la2_role()) = 'editor');


-- ------------------------------------------------------------------
-- 4. Skærm-feed: KUN metadata, aldrig indhold, aldrig titel
-- ------------------------------------------------------------------
-- Kun aktive planer. Læringsplaner identificeres alene ved dato
-- (episode_date) — titlen udleveres bevidst ikke til skærmen.
-- Funktionen tjekker selv rollen, så en vilkårlig "authenticated" bruger
-- (fx en der har oprettet sig selv) får en fejl i stedet for data.

create or replace function public.la2_screen_feed()
returns table (
  plan_id          uuid,
  episode_group_id uuid,
  resident_name    text,
  resident_color   text,
  plan_type        text,
  perspective      text,
  episode_date     date,
  created_at       timestamptz,
  updated_at       timestamptz,
  updated_by_name  text,
  review_due       date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.la2_role() not in ('screen', 'editor') then
    raise exception 'LA2: ingen adgang' using errcode = '42501';
  end if;

  return query
    select p.id, p.episode_group_id, b.navn, b.farve, p.plan_type, p.perspective,
           p.episode_date, p.created_at, p.updated_at, p.updated_by_name, p.review_due
      from public.la2_plans p
      join public.beboere b on b.id = p.resident_id
     where p.status = 'aktiv'
     order by p.updated_at desc;
end;
$$;

revoke all on function public.la2_screen_feed() from public, anon;
grant execute on function public.la2_screen_feed() to authenticated;


-- ------------------------------------------------------------------
-- 5. Seed (kun navne/indstillinger — ingen plandata)
-- ------------------------------------------------------------------

-- Alle nuværende beboere → Møllebakken, variant LA2 (ret til LA2u pr. beboer bagefter)
insert into public.la2_residents (resident_id, botilbud_id)
select b.id, 'f8e5de29-ea42-4183-ad9c-8955a5cd3fe5'::uuid
  from public.beboere b
on conflict (resident_id) do nothing;

-- Medarbejdere fra de navne der p.t. ligger i vagtplanen. Kan rettes bagefter.
insert into public.la2_staff (botilbud_id, navn)
select distinct 'f8e5de29-ea42-4183-ad9c-8955a5cd3fe5'::uuid, btrim(v.navn)
  from public.personaleskaerm_vagter v
 where length(btrim(v.navn)) > 0
on conflict (botilbud_id, navn) do nothing;


-- ==================================================================
-- 6. BRUGERE (køres EFTER SQL'en ovenfor)
-- ==================================================================
-- a) Dashboard → Authentication → Users → "Add user" → "Create new user":
--      la2@mollebakken.dk            (Auto Confirm User: ja)
--      infoskaerm@mollebakken.dk     (Auto Confirm User: ja)
--    Vælg adgangskoder dér. De må ikke stå i kode eller chat.
-- b) Authentication → Providers/Sign In: slå "Allow new users to sign up" FRA.
-- c) Sæt rollerne (kør i SQL editor):
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"la2_role":"editor"}'::jsonb
--    where email = 'la2@mollebakken.dk';
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"la2_role":"screen"}'::jsonb
--    where email = 'infoskaerm@mollebakken.dk';
--
-- Rollen kommer først med i JWT'en ved næste login.
