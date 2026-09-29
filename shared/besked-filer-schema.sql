-- Vedhæftede filer på beskeder (Fase 1). Kørt mod Supabase 2026-09-29.
-- Bucketten er PRIVAT og har bevidst ingen policies på storage.objects:
-- al adgang går via edge-funktionen `besked-fil` (service role, verify_jwt).
-- Se shared/besked-fil-edge-function.ts.

alter table public.beskeder
  add column fil_sti  text,
  add column fil_navn text,
  add column fil_type text;

alter table public.beskeder
  add constraint beskeder_fil_type_chk
  check (fil_type is null or fil_type in ('pdf','jpg','png','docx'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('besked-filer', 'besked-filer', false, 10485760, array[
  'application/pdf','image/jpeg','image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

-- Natlig oprydning af forældreløse filer (mislykkede uploads, skjulte beskeder).
-- Anon-nøglen er den samme som står i appen.
select cron.schedule('ryd-besked-filer', '30 3 * * *', $$
  select net.http_post(
    url := 'https://lumxvqhlmokspqnazhso.supabase.co/functions/v1/besked-fil',
    headers := '{"Authorization": "Bearer <ANON-NØGLE>", "Content-Type": "application/json"}'::jsonb,
    body := '{"action":"ryd"}'::jsonb
  );
$$);
