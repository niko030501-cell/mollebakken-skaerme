-- ==================================================================
-- Pause-funktion — lederen kan tilføje et "Pause"-punkt med en varighed
-- til dagsordenen. Når mødet når til det punkt, kan referenten starte
-- en nedtælling der vises live på Storskærm, og justere varigheden
-- undervejs (+/- 1 min).
--
-- Kør i Supabase SQL editor. Vist til godkendelse 2026-09-23, IKKE
-- kørt automatisk. Ingen RLS-ændringer nødvendige — de eksisterende
-- permissive policies på dagsordenspunkter/moeder dækker allerede disse
-- nye kolonner (kun `status`/`afvist_begrundelse` er låst, se
-- leder-godkendelse-rpc.sql).
-- ==================================================================

-- Sat når et dagsordenspunkt er en pause i stedet for et almindeligt
-- punkt. Antal minutter, redigerbar af referenten inden pausen startes.
alter table dagsordenspunkter add column pause_minutter int;

-- Sat mens en pause er i gang — det tidspunkt den slutter. Storskærm og
-- Referat begge polling/beregner nedtælling herfra. Nulstilles (sættes
-- til null) når referenten går videre til næste punkt.
alter table moeder add column pause_slut_tid timestamptz;
