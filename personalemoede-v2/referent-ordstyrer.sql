-- ==================================================================
-- Referent og ordstyrer kan nu sættes af lederen ved mødeoprettelse, og
-- ændres bagefter fra Leder-fanen. `referent` findes allerede på
-- moeder (sættes i dag først når mødet startes) — kun `ordstyrer` er ny.
--
-- Kør i Supabase SQL editor. Vist til godkendelse 2026-09-23, IKKE kørt
-- automatisk. Ingen RLS-ændringer nødvendige — eksisterende permissive
-- policies på moeder dækker allerede den nye kolonne.
-- ==================================================================

alter table moeder add column ordstyrer text;
