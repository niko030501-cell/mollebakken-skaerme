-- ==================================================================
-- LA2 "Sammenlign" — mødedata: noter/markeringer og bunker.
-- Projekt: lumxvqhlmokspqnazhso.
-- STATUS: skrevet til godkendelse, IKKE kørt.
--
-- To nye tabeller. Eksisterende tabeller og la2_screen_feed() røres ikke.
-- Sammenligningen ændrer aldrig selve planerne: alt mødedata ligger her.
--
-- Adgang (samme model som resten af LA2):
--   * anon:   ingen adgang (grants fjernet + ingen policies)
--   * screen: ingen adgang. Intet herfra vises på infoskærmen.
--   * editor: la2_compare_notes   — læse, oprette, opdatere
--             la2_compare_common  — læse, oprette, slette
--             (common har ingen update: et punkt flyttes ved at slette
--              rækken og oprette en ny, så rækkens identitet aldrig ændres)
-- ==================================================================


-- ------------------------------------------------------------------
-- 1. Noter og markeringer (bruges i Tabel, Tre bunker og Kurver)
-- ------------------------------------------------------------------
-- En række = én note/markering til ét felt (row_key) i en sammenligning
-- af to bestemte versioner. row_key er fx 'roed.tegn', 'forloeb.q1.foer'
-- eller 'kurve'. marking er null (tom), 'enige', 'forskel' eller 'spoergsmaal'.

create table public.la2_compare_notes (
  id               uuid primary key default gen_random_uuid(),
  resident_id      uuid not null references public.beboere(id),
  botilbud_id      uuid not null references public.facilities(id),
  plan_type        text not null check (plan_type in ('trivsel','tryghed','laering','mestring','haab_droem')),
  left_plan_id     uuid not null,
  left_version_no  int  not null,
  right_plan_id    uuid not null,
  right_version_no int  not null,
  row_key          text not null check (length(btrim(row_key)) > 0 and length(row_key) <= 120),
  marking          text check (marking is null or marking in ('enige','forskel','spoergsmaal')),
  note             text not null default '' check (length(note) <= 4000),
  created_by_name  text not null check (length(btrim(created_by_name)) > 0),
  updated_by_name  text not null check (length(btrim(updated_by_name)) > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- versionerne skal findes (planer slettes ikke; ved oprydning af testdata følger noterne med)
  constraint la2_compare_notes_left_fk  foreign key (left_plan_id,  left_version_no)
    references public.la2_plan_versions (plan_id, version_no) on delete cascade,
  constraint la2_compare_notes_right_fk foreign key (right_plan_id, right_version_no)
    references public.la2_plan_versions (plan_id, version_no) on delete cascade,

  -- én række pr. felt i en bestemt sammenligning (bruges til upsert)
  constraint la2_compare_notes_unik unique
    (left_plan_id, left_version_no, right_plan_id, right_version_no, row_key)
);

create index la2_compare_notes_resident_idx on public.la2_compare_notes (resident_id, plan_type);
create index la2_compare_notes_par_idx      on public.la2_compare_notes (left_plan_id, right_plan_id);


-- ------------------------------------------------------------------
-- 2. Fælles punkter ("Begge er enige" i Tre bunker)
-- ------------------------------------------------------------------
-- En række = ét punkt (eller et par) lagt i midten. Versioner gemmes bevidst
-- ikke, så bunkerne følger med til nye versioner af planerne.
--   * kun left_item_id udfyldt:   ét punkt fra venstre side, begge er enige
--   * kun right_item_id udfyldt:  ét punkt fra højre side, begge er enige
--   * begge udfyldt:              to punkter parret som "det samme"

create table public.la2_compare_common (
  id              uuid primary key default gen_random_uuid(),
  resident_id     uuid not null references public.beboere(id),
  botilbud_id     uuid not null references public.facilities(id),
  plan_type       text not null check (plan_type in ('trivsel','tryghed','laering','mestring','haab_droem')),
  left_plan_id    uuid not null references public.la2_plans(id) on delete cascade,
  right_plan_id   uuid not null references public.la2_plans(id) on delete cascade,
  row_key         text not null check (length(btrim(row_key)) > 0 and length(row_key) <= 120),
  left_item_id    text check (left_item_id is null or length(left_item_id) between 1 and 60),
  right_item_id   text check (right_item_id is null or length(right_item_id) between 1 and 60),
  created_by_name text not null check (length(btrim(created_by_name)) > 0),
  created_at      timestamptz not null default now(),

  constraint la2_compare_common_mindst_et check (left_item_id is not null or right_item_id is not null)
);

-- Et punkt kan kun ligge i midten én gang pr. sammenligning og felt
create unique index la2_compare_common_venstre_unik
  on public.la2_compare_common (left_plan_id, right_plan_id, row_key, left_item_id)
  where left_item_id is not null;

create unique index la2_compare_common_hoejre_unik
  on public.la2_compare_common (left_plan_id, right_plan_id, row_key, right_item_id)
  where right_item_id is not null;

create index la2_compare_common_resident_idx on public.la2_compare_common (resident_id, plan_type);


-- ------------------------------------------------------------------
-- 3. Triggere: botilbud, tidsstempler, urørlig identitet, gyldige planer
-- ------------------------------------------------------------------

create or replace function public.la2_compare_notes_before()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n int;
  forventet int;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.botilbud_id is null then
      select r.botilbud_id into new.botilbud_id
        from public.la2_residents r where r.resident_id = new.resident_id;
    end if;

    -- begge planer skal høre til beboeren og plantypen
    forventet := case when new.left_plan_id = new.right_plan_id then 1 else 2 end;
    select count(*) into n from public.la2_plans p
     where p.id in (new.left_plan_id, new.right_plan_id)
       and p.resident_id = new.resident_id
       and p.plan_type = new.plan_type;
    if n <> forventet then
      raise exception 'LA2: planerne passer ikke til beboer og plantype' using errcode = '23514';
    end if;
  else
    -- identiteten ligger fast; kun markering og note kan ændres
    new.resident_id      := old.resident_id;
    new.botilbud_id      := old.botilbud_id;
    new.plan_type        := old.plan_type;
    new.left_plan_id     := old.left_plan_id;
    new.left_version_no  := old.left_version_no;
    new.right_plan_id    := old.right_plan_id;
    new.right_version_no := old.right_version_no;
    new.row_key          := old.row_key;
    new.created_by_name  := old.created_by_name;
    new.created_at       := old.created_at;
  end if;

  return new;
end;
$$;

create trigger la2_compare_notes_before_trg
  before insert or update on public.la2_compare_notes
  for each row execute function public.la2_compare_notes_before();


create or replace function public.la2_compare_common_before()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n int;
  forventet int;
begin
  new.created_at := now();
  if new.botilbud_id is null then
    select r.botilbud_id into new.botilbud_id
      from public.la2_residents r where r.resident_id = new.resident_id;
  end if;

  forventet := case when new.left_plan_id = new.right_plan_id then 1 else 2 end;
  select count(*) into n from public.la2_plans p
   where p.id in (new.left_plan_id, new.right_plan_id)
     and p.resident_id = new.resident_id
     and p.plan_type = new.plan_type;
  if n <> forventet then
    raise exception 'LA2: planerne passer ikke til beboer og plantype' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger la2_compare_common_before_trg
  before insert on public.la2_compare_common
  for each row execute function public.la2_compare_common_before();

-- Trigger-funktionerne skal ikke kunne kaldes som almindelige funktioner
revoke all on function public.la2_compare_notes_before()  from public, anon, authenticated;
revoke all on function public.la2_compare_common_before() from public, anon, authenticated;


-- ------------------------------------------------------------------
-- 4. RLS og grants
-- ------------------------------------------------------------------

alter table public.la2_compare_notes  enable row level security;
alter table public.la2_compare_common enable row level security;

revoke all on public.la2_compare_notes, public.la2_compare_common from public, anon, authenticated;

grant select, insert, update on public.la2_compare_notes  to authenticated;
grant select, insert, delete on public.la2_compare_common to authenticated;

-- Kun editor. 'screen' og anon har ingen policy og ingen grants.
create policy la2_compare_notes_sel on public.la2_compare_notes for select to authenticated
  using ((select public.la2_role()) = 'editor');
create policy la2_compare_notes_ins on public.la2_compare_notes for insert to authenticated
  with check ((select public.la2_role()) = 'editor');
create policy la2_compare_notes_upd on public.la2_compare_notes for update to authenticated
  using ((select public.la2_role()) = 'editor')
  with check ((select public.la2_role()) = 'editor');

create policy la2_compare_common_sel on public.la2_compare_common for select to authenticated
  using ((select public.la2_role()) = 'editor');
create policy la2_compare_common_ins on public.la2_compare_common for insert to authenticated
  with check ((select public.la2_role()) = 'editor');
create policy la2_compare_common_del on public.la2_compare_common for delete to authenticated
  using ((select public.la2_role()) = 'editor');
