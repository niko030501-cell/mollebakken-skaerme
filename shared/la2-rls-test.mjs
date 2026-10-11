// LA2 RLS-test. Kør EFTER la2-schema.sql og efter brugerne er oprettet.
//
//   Windows PowerShell:
//     $env:LA2_ANON_KEY="<anon key>"; $env:LA2_EDITOR_PW="..."; $env:LA2_SCREEN_PW="..."; node shared/la2-rls-test.mjs
//
// Adgangskoder læses KUN fra miljøvariabler. Scriptet printer aldrig planindhold.
// Testen opretter én plan med titlen '__RLS_TEST__' og arkiverer den. Planer
// kan ikke slettes via API'et — oprydnings-SQL printes til sidst.

const URL_ = 'https://lumxvqhlmokspqnazhso.supabase.co';
const ANON = process.env.LA2_ANON_KEY;
const EDITOR_PW = process.env.LA2_EDITOR_PW;
const SCREEN_PW = process.env.LA2_SCREEN_PW;
if (!ANON || !EDITOR_PW || !SCREEN_PW) {
  console.error('Mangler miljøvariabler LA2_ANON_KEY, LA2_EDITOR_PW, LA2_SCREEN_PW');
  process.exit(2);
}

let fejl = 0;
function tjek(navn, ok, detalje) {
  console.log((ok ? 'OK    ' : 'FEJL  ') + navn + (ok ? '' : '   -> ' + detalje));
  if (!ok) fejl++;
}

async function api(path, { token, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + (token || ANON),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* tom body */ }
  return { status: res.status, json };
}

async function login(email, pw) {
  const r = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password: pw },
  });
  if (!r.json || !r.json.access_token) throw new Error('Login fejlede for ' + email);
  return r.json.access_token;
}

// "Blokeret" = fejl-status ELLER tom liste (RLS filtrerer stille).
const blokeret = (r) => r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0);

const TABELLER = ['la2_plans', 'la2_plan_versions', 'la2_residents', 'la2_staff'];

// ---------- editor (først, så der er data at forsøge at læse) ----------
const editor = await login('la2@mollebakken.dk', EDITOR_PW);
const screen = await login('infoskaerm@mollebakken.dk', SCREEN_PW);

console.log('\n== editor ==');
const res = await api('/rest/v1/la2_residents?select=resident_id,botilbud_id,variant&limit=1', { token: editor });
tjek('editor kan læse la2_residents', res.status === 200 && res.json.length === 1, JSON.stringify(res.status));
const resident = res.json && res.json[0];

const grp = crypto.randomUUID();
const ins = await api('/rest/v1/la2_plans', {
  token: editor, method: 'POST', headers: { Prefer: 'return=representation' },
  body: {
    resident_id: resident.resident_id, plan_type: 'laering', perspective: 'min',
    title: '__RLS_TEST__', episode_date: '2026-01-01', episode_group_id: grp,
    content: { test: 'hemmeligt-indhold' }, status: 'aktiv',
    created_by_name: 'RLS-test', updated_by_name: 'RLS-test',
  },
});
tjek('editor kan oprette plan', ins.status === 201 && ins.json && ins.json[0], ins.status);
const planId = ins.json && ins.json[0] && ins.json[0].id;
tjek('review_due sat automatisk', !!(ins.json && ins.json[0] && ins.json[0].review_due), '');

const upd = await api('/rest/v1/la2_plans?id=eq.' + planId, {
  token: editor, method: 'PATCH', headers: { Prefer: 'return=representation' },
  body: { content: { test: 'ændret' }, updated_by_name: 'RLS-test' },
});
tjek('editor kan opdatere plan', upd.status === 200 && upd.json.length === 1, upd.status);

const ver = await api('/rest/v1/la2_plan_versions?plan_id=eq.' + planId + '&select=version_no&order=version_no', { token: editor });
tjek('trigger har lavet 2 versioner', ver.status === 200 && ver.json.length === 2, JSON.stringify(ver.json));

const verIns = await api('/rest/v1/la2_plan_versions', {
  token: editor, method: 'POST',
  body: { plan_id: planId, version_no: 99, content: {}, status: 'aktiv', edited_by_name: 'x' },
});
tjek('editor kan IKKE skrive versioner direkte', verIns.status >= 400, verIns.status);

const del = await api('/rest/v1/la2_plans?id=eq.' + planId, { token: editor, method: 'DELETE', headers: { Prefer: 'return=representation' } });
tjek('editor kan IKKE slette plan', del.status >= 400 || (Array.isArray(del.json) && del.json.length === 0), del.status);

const feedE = await api('/rest/v1/rpc/la2_screen_feed', { token: editor, method: 'POST', body: {} });
tjek('editor kan kalde la2_screen_feed', feedE.status === 200 && feedE.json.some((r) => r.plan_id === planId), feedE.status);

// ---------- anon ----------
console.log('\n== anon ==');
for (const t of TABELLER) {
  const r = await api('/rest/v1/' + t + '?select=*&limit=1');
  tjek('anon kan IKKE læse ' + t, blokeret(r), r.status);
}
const aIns = await api('/rest/v1/la2_plans', { method: 'POST', body: { title: 'x' } });
tjek('anon kan IKKE skrive la2_plans', aIns.status >= 400, aIns.status);
const aFeed = await api('/rest/v1/rpc/la2_screen_feed', { method: 'POST', body: {} });
tjek('anon kan IKKE kalde la2_screen_feed', aFeed.status >= 400, aFeed.status);

// ---------- screen ----------
console.log('\n== screen (infoskaerm) ==');
const sFeed = await api('/rest/v1/rpc/la2_screen_feed', { token: screen, method: 'POST', body: {} });
tjek('screen kan læse la2_screen_feed', sFeed.status === 200 && Array.isArray(sFeed.json), sFeed.status);
const række = (sFeed.json || []).find((r) => r.plan_id === planId);
tjek('feedet indeholder testplanen', !!række, '');
tjek('feedet har INGEN content/title-kolonner',
  !!række && !('content' in række) && !('draft_content' in række) && !('title' in række),
  række ? Object.keys(række).join(',') : '');
for (const t of TABELLER) {
  const r = await api('/rest/v1/' + t + '?select=*&limit=1', { token: screen });
  tjek('screen kan IKKE læse ' + t, blokeret(r), r.status);
}
const sIns = await api('/rest/v1/la2_plans', { token: screen, method: 'POST', body: { title: 'x' } });
tjek('screen kan IKKE skrive la2_plans', sIns.status >= 400, sIns.status);
const sUpd = await api('/rest/v1/la2_plans?id=eq.' + planId, {
  token: screen, method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { status: 'arkiv' },
});
tjek('screen kan IKKE opdatere la2_plans', sUpd.status >= 400 || (Array.isArray(sUpd.json) && sUpd.json.length === 0), sUpd.status);

// ---------- ryd op: arkivér testplanen ----------
await api('/rest/v1/la2_plans?id=eq.' + planId, {
  token: editor, method: 'PATCH', body: { status: 'arkiv', updated_by_name: 'RLS-test' },
});

console.log('\n' + (fejl === 0 ? 'ALLE TESTS BESTÅET' : fejl + ' TEST(S) FEJLEDE'));
console.log('\nOpryd testplanen i SQL editor (planer kan ikke slettes via API):');
console.log("  delete from la2_plan_versions where plan_id in (select id from la2_plans where title = '__RLS_TEST__');");
console.log("  delete from la2_plans where title = '__RLS_TEST__';");
process.exit(fejl === 0 ? 0 : 1);
