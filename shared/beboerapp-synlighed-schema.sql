-- Beboerapp: hvad hver beboer kan se (til/fra pr. modul).
-- Regel: findes der ingen række, er modulet SYNLIGT. Nye moduler er derfor synlige fra start.
-- Samme model som resten af beboerappen (beboer-traening-schema.sql): RLS slået til, ingen
-- direkte rettigheder på tabellen, al adgang via security definer-funktioner med token.
-- Kan køres flere gange.

create table if not exists public.beboerapp_synlighed (
  beboer    text        not null,                 -- kun fornavn
  modul     text        not null,                 -- fx dagsplan, traening, kalender
  synlig    boolean     not null,
  opdateret timestamptz not null default now(),
  unique (beboer, modul)
);

alter table public.beboerapp_synlighed enable row level security;
revoke all on public.beboerapp_synlighed from public, anon, authenticated;

-- Personale: alle indstillinger (kun rækker der er gemt)
create or replace function public.personale_hent_synlighed(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform _personale_tjek_token(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('beboer', beboer, 'modul', modul, 'synlig', synlig))
                     from beboerapp_synlighed), '[]'::jsonb);
end;
$$;

-- Personale: slå ét modul til/fra for én beboer (fornavn skal findes i beboere)
create or replace function public.personale_saet_synlighed(p_token text, p_beboer text, p_modul text, p_synlig boolean)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text;
begin
  perform _personale_tjek_token(p_token);
  select navn into v_navn from beboere where lower(navn) = lower(btrim(coalesce(p_beboer, ''))) limit 1;
  if v_navn is null then
    raise exception 'Ukendt beboer';
  end if;
  if p_modul is null or p_modul !~ '^[a-z_]{1,40}$' or p_synlig is null then
    raise exception 'Ugyldigt modul';
  end if;
  insert into beboerapp_synlighed (beboer, modul, synlig, opdateret)
    values (v_navn, p_modul, p_synlig, now())
  on conflict (beboer, modul) do update set synlig = excluded.synlig, opdateret = now();
end;
$$;

-- Beboer: nøglerne på de moduler der er slået FRA for den indloggede beboer
create or replace function public.beboer_synlighed(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_navn text;
begin
  select navn into v_navn from beboere where id = _beboer_fra_token(p_token);
  return coalesce((select jsonb_agg(modul order by modul) from beboerapp_synlighed
                    where beboer = v_navn and not synlig), '[]'::jsonb);
end;
$$;

revoke execute on function
  public.personale_hent_synlighed(text), public.personale_saet_synlighed(text, text, text, boolean),
  public.beboer_synlighed(text)
  from public;
grant execute on function
  public.personale_hent_synlighed(text), public.personale_saet_synlighed(text, text, text, boolean),
  public.beboer_synlighed(text)
  to anon, authenticated;
