// Edge-funktion `piktogram-billede` (verify_jwt: true — anon-nøglen er et gyldigt JWT).
// Lader personalet uploade piktogram-billeder til bucket'en `piktogram-billeder`
// UDEN at bucket'en har insert-policies. Samme mønster som `ovelse-billede`.
//
// Tokenen fra personale_login() tjekkes med _personale_tjek_token før der udleveres
// en signeret upload-URL. Filnavnet laves altid af serveren: piktogrammer/<uuid>.jpg
//
// Handlinger (POST, JSON):
//   upload  { token }        -> { sti, token, url }
//   slet    { token, sti }   -> { ok }   (kun hvis ingen billeder eller kategorier bruger filen)
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'piktogram-billeder';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const STI = /^piktogrammer\/[0-9a-f-]{36}\.jpg$/;

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function tokenOk(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length !== 64) return false;
  const { error } = await sb.rpc('_personale_tjek_token', { p_token: token });
  return !error;
}

async function erIBrug(sti: string): Promise<boolean> {
  const a = await sb.from('piktogram_piktogrammer').select('id', { head: true, count: 'exact' }).eq('billede_path', sti);
  const b = await sb.from('piktogram_kategorier').select('id', { head: true, count: 'exact' }).eq('billede_path', sti);
  return (a.count ?? 0) > 0 || (b.count ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { action, token, sti } = await req.json();

    if (action === 'upload') {
      if (!(await tokenOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
      const navn = 'piktogrammer/' + crypto.randomUUID() + '.jpg';
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(navn);
      if (error) return svar({ fejl: 'Kunne ikke starte upload' }, 500);
      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(navn);
      return svar({ sti: navn, token: data.token, url: pub.publicUrl });
    }

    if (action === 'slet') {
      if (!(await tokenOk(token))) return svar({ fejl: 'Du er logget ud' }, 401);
      if (typeof sti !== 'string' || !STI.test(sti)) return svar({ ok: false });
      if (await erIBrug(sti)) return svar({ ok: false });
      await sb.storage.from(BUCKET).remove([sti]);
      return svar({ ok: true });
    }

    return svar({ fejl: 'Ukendt handling' }, 400);
  } catch (_e) {
    return svar({ fejl: 'Noget gik galt' }, 500);
  }
});
