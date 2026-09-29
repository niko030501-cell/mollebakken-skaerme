// Edge-funktion `besked-fil` (deployet 2026-09-29, verify_jwt: true).
// Handlinger: upload (signed upload-token), hent (60 sek. signed URL),
// slet (kun hvis ingen aktiv besked bruger filen), ryd (cron, filer > 1 døgn).
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'besked-filer';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const TYPER: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const svar = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// En fil må kun slettes hvis ingen AKTIV besked peger på den
async function erIBrug(sti: string) {
  const { count } = await sb.from('beskeder').select('id', { count: 'exact', head: true })
    .eq('fil_sti', sti).eq('aktiv', true);
  return (count ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { action, type, besked_id, sti } = await req.json();

    if (action === 'upload') {
      const ext = TYPER[type];
      if (!ext) return svar({ fejl: 'Filtypen er ikke tilladt' }, 400);
      const ny = crypto.randomUUID() + '.' + ext;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(ny);
      if (error) return svar({ fejl: 'Kunne ikke starte upload' }, 500);
      return svar({ sti: ny, token: data.token });
    }

    if (action === 'hent') {
      const { data: b } = await sb.from('beskeder').select('fil_sti')
        .eq('id', besked_id).eq('aktiv', true).maybeSingle();
      if (!b?.fil_sti) return svar({ fejl: 'Filen findes ikke' }, 404);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(b.fil_sti, 60);
      if (error) return svar({ fejl: 'Kunne ikke åbne filen' }, 500);
      return svar({ url: data.signedUrl });
    }

    if (action === 'slet') {
      if (typeof sti !== 'string' || await erIBrug(sti)) return svar({ ok: false });
      await sb.storage.from(BUCKET).remove([sti]);
      return svar({ ok: true });
    }

    if (action === 'ryd') {
      const { data: filer } = await sb.storage.from(BUCKET).list('', { limit: 1000 });
      const grænse = Date.now() - 86400000;
      const slet: string[] = [];
      for (const f of filer ?? []) {
        if (new Date(f.created_at).getTime() < grænse && !(await erIBrug(f.name))) slet.push(f.name);
      }
      if (slet.length) await sb.storage.from(BUCKET).remove(slet);
      return svar({ ryddet: slet.length });
    }

    return svar({ fejl: 'Ukendt handling' }, 400);
  } catch (_e) {
    return svar({ fejl: 'Noget gik galt' }, 500);
  }
});
