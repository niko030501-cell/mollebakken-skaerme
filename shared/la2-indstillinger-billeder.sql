-- ==================================================================
-- LA2: indstillinger (LA2 / LA2u / TIP), nyt plantype 'trivselsoeer'
-- og privat billedbucket.
-- Projekt: lumxvqhlmokspqnazhso.   STATUS: skrevet til godkendelse, IKKE kørt.
--
--  1. la2_residents får to nye felter:
--       indefra_form  'LA2' (tekst) | 'LA2u' (billedstøttet)  -> Min-planens udseende
--       bruger_tip    true/false                              -> har beboeren også Din-planer (TIP)
--     Eksisterende rækker flyttes: LA2 -> (LA2, false), LA2u -> (LA2u, true).
--     `variant` BEHOLDES midlertidigt (koden læser den, til fase 2 er klar).
--  2. plan_type får værdien 'trivselsoeer' (planer, noter, fælles punkter).
--  3. Privat bucket 'la2-billeder': kun editor må læse og uploade.
--     Ingen update/delete-policy: billeder overskrives eller slettes ikke.
--
-- Ingen planer eller versioner røres. Intet slettes.
-- ==================================================================


-- ------------------------------------------------------------------
-- 1. Beboerindstillinger
-- ------------------------------------------------------------------

alter table public.la2_residents
  add column indefra_form text    not null default 'LA2'
    check (indefra_form in ('LA2', 'LA2u')),
  add column bruger_tip   boolean not null default false;

update public.la2_residents
   set indefra_form = variant,
       bruger_tip   = (variant = 'LA2u');

comment on column public.la2_residents.variant is
  'UDFASES: brug indefra_form og bruger_tip. Beholdes indtil koden ikke længere læser den.';
comment on column public.la2_residents.indefra_form is
  'LA2 = Min-planen med tekst. LA2u = Min-planen med tekst og billeder.';
comment on column public.la2_residents.bruger_tip is
  'Har beboeren også Din-planer (tilstræbt indefra-perspektiv, TIP)?';


-- ------------------------------------------------------------------
-- 2. Ny plantype: trivselsoeer
-- ------------------------------------------------------------------

alter table public.la2_plans drop constraint la2_plans_plan_type_check;
alter table public.la2_plans add constraint la2_plans_plan_type_check
  check (plan_type in ('trivsel','tryghed','laering','mestring','haab_droem','trivselsoeer'));

alter table public.la2_compare_notes drop constraint la2_compare_notes_plan_type_check;
alter table public.la2_compare_notes add constraint la2_compare_notes_plan_type_check
  check (plan_type in ('trivsel','tryghed','laering','mestring','haab_droem','trivselsoeer'));

alter table public.la2_compare_common drop constraint la2_compare_common_plan_type_check;
alter table public.la2_compare_common add constraint la2_compare_common_plan_type_check
  check (plan_type in ('trivsel','tryghed','laering','mestring','haab_droem','trivselsoeer'));


-- ------------------------------------------------------------------
-- 3. Privat bucket til billeder (editor-only)
-- ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('la2-billeder', 'la2-billeder', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Kun editor. anon og screen har ingen policy og dermed ingen adgang.
-- Billeder vises i appen med kortvarige signerede links.
create policy la2_billeder_laes on storage.objects
  for select to authenticated
  using (bucket_id = 'la2-billeder' and (select public.la2_role()) = 'editor');

create policy la2_billeder_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'la2-billeder' and (select public.la2_role()) = 'editor');


-- ==================================================================
-- TEST (kør efter ovenstående; alt rulles tilbage med en bevidst fejl)
-- ==================================================================
--
-- do $$
-- declare
--   n int; res text := '';
--   c_anon   text := '{"role":"anon"}';
--   c_editor text := '{"role":"authenticated","app_metadata":{"la2_role":"editor"}}';
--   c_screen text := '{"role":"authenticated","app_metadata":{"la2_role":"screen"}}';
-- begin
--   -- flytning af beboere
--   select count(*) into n from public.la2_residents where indefra_form <> variant or bruger_tip <> (variant = 'LA2u');
--   res := res || E'\n' || case when n = 0 then 'OK    ' else 'FEJL  ' end || 'alle beboere er flyttet korrekt (' || n || ' afvigelser)';
--
--   -- bucket er privat og begrænset
--   select count(*) into n from storage.buckets
--    where id = 'la2-billeder' and public = false and file_size_limit = 5242880;
--   res := res || E'\n' || case when n = 1 then 'OK    ' else 'FEJL  ' end || 'bucket la2-billeder er privat (5 MB)';
--
--   -- anon
--   perform set_config('request.jwt.claims', c_anon, true);
--   set local role anon;
--   begin
--     insert into storage.objects (bucket_id, name) values ('la2-billeder', '__test__.png');
--     res := res || E'\nFEJL  anon kunne uploade';
--   exception when others then
--     res := res || E'\nOK    anon kan ikke uploade';
--   end;
--   select count(*) into n from storage.objects where bucket_id = 'la2-billeder';
--   res := res || E'\n' || case when n = 0 then 'OK    ' else 'FEJL  ' end || 'anon ser ingen billeder';
--   reset role;
--
--   -- screen
--   perform set_config('request.jwt.claims', c_screen, true);
--   set local role authenticated;
--   begin
--     insert into storage.objects (bucket_id, name, owner) values ('la2-billeder', '__test__.png', null);
--     res := res || E'\nFEJL  screen kunne uploade';
--   exception when others then
--     res := res || E'\nOK    screen kan ikke uploade';
--   end;
--   reset role;
--
--   -- editor
--   perform set_config('request.jwt.claims', c_editor, true);
--   set local role authenticated;
--   begin
--     insert into storage.objects (bucket_id, name) values ('la2-billeder', '__test__.png');
--     res := res || E'\nOK    editor kan uploade';
--   exception when others then
--     res := res || E'\nFEJL  editor kunne ikke uploade: ' || sqlerrm;
--   end;
--   begin
--     delete from storage.objects where bucket_id = 'la2-billeder' and name = '__test__.png';
--     get diagnostics n = row_count;
--     res := res || E'\n' || case when n = 0 then 'OK    ' else 'FEJL  ' end || 'editor kan ikke slette billeder (' || n || ')';
--   exception when insufficient_privilege then
--     res := res || E'\nOK    editor kan ikke slette billeder';
--   end;
--   reset role;
--
--   raise exception E'TESTRESULTAT (rullet tilbage):%', res;
-- end
-- $$;
