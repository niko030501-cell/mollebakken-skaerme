// Edge-funktion `kost-billede` (verify_jwt: true — anon-nøglen er et gyldigt JWT).
// Billeder til kostplanen ligger i den PRIVATE bucket `kost-billeder` (ingen policies,
// ikke offentlig). Funktionen er eneste vej ind og ud, og tjekker altid token først.
//
// Handlinger (POST, JSON):
//   upload  { token, type }              -> { sti, token }       (personale-token)
//   hent    { rolle, token, stier[] }    -> { urls: { sti: url } } (signerede, 1 time)
//             rolle 'personale': alle filer
//             rolle 'beboer'   : kun filer i borgerens egen, aktive plan
//   slet    { token, sti }               -> { ok }  (personale; kun hvis filen ikke bruges)
//   ryd     {}                           -> { slettet } (filer > 1 døgn der ikke bruges)
//
// Filnavnet laves altid af serveren (uuid + endelse), aldrig af klienten.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'kost-billeder';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const TYPER: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const FILNAVN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const UDLOEB_SEK = 3600;

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function personaleOk(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length !== 64) return false;
  const { error } = await sb.rpc('_personale_tjek_token', { p_token: token });
  return !error;
}

// Returnerer beboerens id eller null
async function beboerId(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || token.length !== 64) return null;
  const { data, error } = await sb.rpc('_beboer_fra_token', { p_token: token });
  return error || !data ? null : String(data);
}

async function brugt(sti: string): Promise<boolean> {
  const { data } = await sb.rpc('_kost_sti_brugt', { p_sti: sti });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { action, rolle, token, type, sti, stier } = await req.json();

    if (action === 'upload') {
      if (!(await personaleOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
      const ext = TYPER[type];
      if (!ext) return svar({ fejl: 'Filtypen er ikke tilladt' }, 400);
      const navn = crypto.randomUUID() + '.' + ext;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(navn);
      if (error) return svar({ fejl: 'Kunne ikke starte upload' }, 500);
      return svar({ sti: navn, token: data.token });
    }

    if (action === 'hent') {
      if (!Array.isArray(stier) || stier.length > 80) return svar({ fejl: 'Ugyldig forespørgsel' }, 400);
      const liste: string[] = stier.filter((s: unknown) => typeof s === 'string' && FILNAVN.test(s));
      let tilladt: string[] = [];
      if (rolle === 'personale') {
        if (!(await personaleOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
        tilladt = liste;
      } else if (rolle === 'beboer') {
        const id = await beboerId(token);
        if (!id) return svar({ fejl: 'Du er logget ud' }, 401);
        for (const s of liste) {
          const { data } = await sb.rpc('_kost_sti_tilladt', { p_beboer: id, p_sti: s });
          if (data === true) tilladt.push(s);
        }
      } else {
        return svar({ fejl: 'Ukendt rolle' }, 400);
      }
      const urls: Record<string, string> = {};
      if (tilladt.length > 0) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(tilladt, UDLOEB_SEK);
        if (error) return svar({ fejl: 'Kunne ikke hente billeder' }, 500);
        for (const r of data ?? []) {
          if (r.signedUrl && r.path) urls[r.path] = r.signedUrl;
        }
      }
      return svar({ urls });
    }

    if (action === 'slet') {
      if (!(await personaleOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
      if (typeof sti !== 'string' || !FILNAVN.test(sti)) return svar({ ok: false });
      if (await brugt(sti)) return svar({ ok: false });
      await sb.storage.from(BUCKET).remove([sti]);
      return svar({ ok: true });
    }

    if (action === 'ryd') {
      // Kun forældreløse filer ældre end et døgn — sikker at kalde uden token.
      const { data: filer } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
      const graense = Date.now() - 24 * 60 * 60 * 1000;
      const vaek: string[] = [];
      for (const f of filer ?? []) {
        if (FILNAVN.test(f.name) && f.created_at && new Date(f.created_at).getTime() < graense
            && !(await brugt(f.name))) vaek.push(f.name);
      }
      if (vaek.length > 0) await sb.storage.from(BUCKET).remove(vaek);
      return svar({ slettet: vaek.length });
    }

    return svar({ fejl: 'Ukendt handling' }, 400);
  } catch (_e) {
    return svar({ fejl: 'Noget gik galt' }, 500);
  }
});
