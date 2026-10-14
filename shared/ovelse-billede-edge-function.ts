// Edge-funktion `ovelse-billede` (verify_jwt: true — anon-nøglen er et gyldigt JWT).
// Lader personalet uploade billeder af maskiner til bucket'en `ovelse-billeder`
// UDEN at bucket'en har insert-policies. Samme mønster som `besked-fil`.
//
// Personalet logger ikke ind med Supabase Auth, men med en token fra
// personale_login(). Funktionen tjekker tokenen med _personale_tjek_token
// (kun kaldbar for service_role) før den udleverer en signeret upload-URL.
//
// Handlinger (POST, JSON):
//   upload  { token, type }       -> { sti, token, url }   (type: image/jpeg|png|webp)
//   slet    { token, sti }        -> { ok }   (kun hvis filen ikke bruges af en øvelse)
//   ryd     {}                    -> { slettet }  (cron: filer > 1 døgn der ikke bruges)
//
// Filnavnet laves altid af serveren (uuid + endelse), aldrig af klienten.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'ovelse-billeder';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const TYPER: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const FILNAVN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Filnavne som øvelserne peger på (sidste del af URL'en)
async function brugteFilnavne(): Promise<Set<string>> {
  const { data } = await sb.from('ovelser').select('billede_sti, billede2_sti');
  const sæt = new Set<string>();
  for (const r of data ?? []) {
    for (const sti of [r.billede_sti, r.billede2_sti]) {
      if (typeof sti === 'string' && sti.includes('/' + BUCKET + '/')) {
        sæt.add(sti.split('/').pop()!);
      }
    }
  }
  return sæt;
}

async function tokenOk(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length !== 64) return false;
  const { error } = await sb.rpc('_personale_tjek_token', { p_token: token });
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { action, token, type, sti } = await req.json();

    if (action === 'upload') {
      if (!(await tokenOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
      const ext = TYPER[type];
      if (!ext) return svar({ fejl: 'Filtypen er ikke tilladt' }, 400);
      const navn = crypto.randomUUID() + '.' + ext;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(navn);
      if (error) return svar({ fejl: 'Kunne ikke starte upload' }, 500);
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(navn);
      return svar({ sti: navn, token: data.token, url: pub.publicUrl });
    }

    if (action === 'slet') {
      if (!(await tokenOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
      if (typeof sti !== 'string' || !FILNAVN.test(sti)) return svar({ ok: false });
      if ((await brugteFilnavne()).has(sti)) return svar({ ok: false });
      await sb.storage.from(BUCKET).remove([sti]);
      return svar({ ok: true });
    }

    if (action === 'ryd') {
      // Kun filer ældre end et døgn og som ingen øvelse bruger. Sikker at
      // kalde uden token (den kan kun fjerne forældreløse filer).
      const brugte = await brugteFilnavne();
      const { data: filer } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
      const graense = Date.now() - 24 * 60 * 60 * 1000;
      const væk = (filer ?? [])
        .filter((f) => FILNAVN.test(f.name) && !brugte.has(f.name) &&
          f.created_at && new Date(f.created_at).getTime() < graense)
        .map((f) => f.name);
      if (væk.length > 0) await sb.storage.from(BUCKET).remove(væk);
      return svar({ slettet: væk.length });
    }

    return svar({ fejl: 'Ukendt handling' }, 400);
  } catch (_e) {
    return svar({ fejl: 'Noget gik galt' }, 500);
  }
});
