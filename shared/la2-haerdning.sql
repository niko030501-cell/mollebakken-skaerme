-- ==================================================================
-- LA2 — hærdning af egne funktioner (fund fra Supabase security advisor).
-- Projekt: lumxvqhlmokspqnazhso.
-- STATUS: skrevet til godkendelse, IKKE kørt.
--
-- Ingen ændring i adfærd. Det eneste der sker:
--   1) la2_plans_snapshot() er en trigger-funktion (security definer).
--      Den kan ikke kaldes som almindelig funktion, men står alligevel som
--      "kaldbar via /rest/v1/rpc/". EXECUTE fjernes fra anon/authenticated.
--      Triggeren virker uændret (EXECUTE tjekkes kun ved CREATE TRIGGER).
--   2) De tre LA2-funktioner uden fast search_path får en fast
--      search_path, så de ikke kan påvirkes af en brugers egen indstilling.
--
-- la2_screen_feed() er med vilje kaldbar af 'authenticated': funktionen
-- tjekker selv rollen (screen/editor) og afviser alle andre. Den røres ikke.
-- ==================================================================

revoke all on function public.la2_plans_snapshot() from public, anon, authenticated;

alter function public.la2_role()              set search_path = public, pg_temp;
alter function public.la2_touch_updated_at()  set search_path = public, pg_temp;
alter function public.la2_plans_before()      set search_path = public, pg_temp;
