-- Engangs-sortering af eksisterende beskeder efter emne (ud fra ordene i teksten).
-- Rører KUN kolonnen emne, og KUN rækker hvor emne = 'andet' lige nu. Intet slettes.
-- Tabellen har ingen botilbud-/afdelingskolonne, så alle rækker er Møllebakkens.
-- Fortryd: se fortryd-sorter-emner.sql (gemmer sikkerhedskopi i backup-beskeder-emne.csv).
--
-- Regler, første match vinder, ellers bliver beskeden i 'andet'. Små/store bogstaver er ens.
-- Et ord skal begynde ved en ordgrænse ("aftenstruktur" rammer ikke "struktur", men "strukturbeskrivelse"
-- og "Louie-mappen" gør). Korte ord (obs, pn, mad, tur, kost, plan) skal være hele ord, evt. bøjet.

with regler(rang, emne, moenster) as (values
  (1, 'obs',      '(?<![[:alpha:]])obs(?![[:alpha:]])'),
  (2, 'medicin',  '(?<![[:alpha:]])(medicin|piller|tabletter|depot)|(?<![[:alpha:]])pn(?![[:alpha:]])'),
  (3, 'motion',   '(?<![[:alpha:]])(motion|gåtur|træning|fitness)|(?<![[:alpha:]])tur(e|er|en|ene|erne)?(?![[:alpha:]])'),
  (4, 'mad',      '(?<![[:alpha:]])(madplan|spise|drikke|vægt)|(?<![[:alpha:]])(mad|kost)(e|er|en|et|ene|erne)?(?![[:alpha:]])'),
  (5, 'aftaler',  '(?<![[:alpha:]])(aftale|besøg|læge|tandlæge|møde|kørsel)'),
  (6, 'struktur', '(?<![[:alpha:]])(struktur|mappe|skema)|(?<![[:alpha:]])plan(e|er|en|et|ene|erne)?(?![[:alpha:]])'),
  (7, 'husk',     '(?<![[:alpha:]])(husk|piktogram|keyhanger|nøgle)'),
  (8, 'praktisk', '(?<![[:alpha:]])(reparation|bestil|mangler|defekt|batteri)')
),
forslag as (
  select distinct on (b.id)
         b.id, coalesce(b.beboere[1], b.beboer) as fornavn, coalesce(b.titel, b.besked) as tekst,
         r.emne as nyt_emne, substring(lower(coalesce(b.titel, b.besked)) from r.moenster) as match_ord
  from public.beskeder b
  join regler r on lower(coalesce(b.titel, b.besked)) ~ r.moenster
  where b.emne = 'andet'
  order by b.id, r.rang
)
