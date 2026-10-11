-- ==================================================================
-- LA2-fane på infoskærmen (personaletavle-v2) — Fase 5.
-- Projekt: lumxvqhlmokspqnazhso.
-- STATUS: skrevet til godkendelse, IKKE kørt.
--
-- 1) la2_screen_feed() udvides med last_active_at / last_active_by:
--    tidspunktet og navnet fra den seneste AKTIVE gemning (version der
--    ikke er et udkast). Uden dette ville en der blot gemmer et udkast
--    oven på en aktiv plan få infoskærmen til at sige "opdateret", selv om
--    den aktive plan er uændret. Selve planindholdet udleveres stadig
--    aldrig — kun metadata.
--
-- 2) Fanen "la2" tilføjes til skaerm_indstillinger (kun en ny RÆKKE, ingen
--    ændring af tabellens adgang). Den oprettes SLUKKET (aktiv=false), så
--    intet ændrer sig på skærmen, før du tænder den i appen under
--    Admin → Skærme. Så kan du først logge TV'et ind.
-- ==================================================================


-- ------------------------------------------------------------------
-- 1. Feedet
-- ------------------------------------------------------------------
-- Returtypen ændres, så funktionen skal droppes og oprettes igen. Det
-- fjerner også dens grants, som derfor sættes igen nedenfor.

drop function if exists public.la2_screen_feed();

create function public.la2_screen_feed()
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
  review_due       date,
  last_active_at   timestamptz,
  last_active_by   text
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
           p.episode_date, p.created_at, p.updated_at, p.updated_by_name, p.review_due,
           coalesce(lv.edited_at, p.updated_at),
           coalesce(lv.edited_by_name, p.updated_by_name)
      from public.la2_plans p
      join public.beboere b on b.id = p.resident_id
      left join lateral (
        select v.edited_at, v.edited_by_name
          from public.la2_plan_versions v
         where v.plan_id = p.id
           and v.is_draft = false
           and v.status = 'aktiv'
         order by v.version_no desc
         limit 1
      ) lv on true
     where p.status = 'aktiv'
     order by coalesce(lv.edited_at, p.updated_at) desc;
end;
$$;

revoke all on function public.la2_screen_feed() from public, anon;
grant execute on function public.la2_screen_feed() to authenticated;


-- ------------------------------------------------------------------
-- 2. Fanen i skaerm_indstillinger (slukket til at begynde med)
-- ------------------------------------------------------------------

insert into public.skaerm_indstillinger (skaerm, noegle, aktiv, raekkefoelge, visningstid_sek)
select 'infoskaerm', 'la2', false,
       coalesce((select max(raekkefoelge) from public.skaerm_indstillinger where skaerm = 'infoskaerm'), 0) + 1,
       30
on conflict (skaerm, noegle) do nothing;
