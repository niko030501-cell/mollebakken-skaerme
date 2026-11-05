-- Beskeder: emner + indstilling "Beskeder: udseende" (Mørk/Lys) på infoskærmen.
-- Additivt og idempotent. Eksisterende beskeder får emnet 'andet'. Intet slettes.

alter table public.beskeder
  add column if not exists emne text not null default 'andet';

alter table public.beskeder drop constraint if exists beskeder_emne_check;
alter table public.beskeder add constraint beskeder_emne_check
  check (emne in ('obs','medicin','motion','mad','struktur','aftaler','praktisk','husk','andet'));

-- Lille nøgle/værdi-tabel til indstillinger (samme åbne adgangsmodel som skaerm_indstillinger).
create table if not exists public.app_indstillinger (
  noegle   text primary key,
  vaerdi   text not null,
  opdateret timestamptz not null default now()
);

alter table public.app_indstillinger enable row level security;
drop policy if exists "app_indstillinger_select" on public.app_indstillinger;
drop policy if exists "app_indstillinger_insert" on public.app_indstillinger;
drop policy if exists "app_indstillinger_update" on public.app_indstillinger;
create policy "app_indstillinger_select" on public.app_indstillinger for select using (true);
create policy "app_indstillinger_insert" on public.app_indstillinger for insert with check (true);
create policy "app_indstillinger_update" on public.app_indstillinger for update using (true) with check (true);

insert into public.app_indstillinger (noegle, vaerdi) values ('beskeder_udseende', 'lys')
on conflict (noegle) do nothing;
