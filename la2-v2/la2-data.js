// ==================================================================
// LA2 — dataadgang (Supabase). Alt går gennem Supabase Auth + RLS.
//
// Regler:
//  * Planindhold caches ALDRIG (hverken localStorage, sessionStorage
//    eller globale variabler ud over det der vises lige nu) og skrives
//    aldrig til console.
//  * Klienten har sin EGEN storageKey. LA2 ligger på samme origin som
//    appen og tavlen — uden egen nøgle ville login-sessionen blive delt
//    og gøre de andre apps' klienter 'authenticated'.
// ==================================================================
window.LA2Data = (function(){
  'use strict';

  var SUPABASE_URL = 'https://lumxvqhlmokspqnazhso.supabase.co';
  // Anon-nøglen er offentlig af design. Den giver INGEN adgang til LA2-data
  // (se shared/la2-schema.sql) — kun et login med la2_role gør.
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1bXh2cWhsbW9rc3BxbmF6aHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMzc3NTMsImV4cCI6MjA5OTYxMzc1M30.WvVrbqZWaY1V-6sC4XwoYDOciBULeCxcnxvB7TlAMno';

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storageKey: 'la2-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  var PLAN_META = 'id,resident_id,botilbud_id,plan_type,perspective,title,episode_date,episode_group_id,filled_with,status,review_months,review_due,created_by_name,updated_by_name,created_at,updated_at';
  var PLAN_FULL = PLAN_META + ',content,draft_content';

  function unwrap(res){
    if(res.error) throw res.error;
    return res.data;
  }

  return {
    getSession: function(){
      return client.auth.getSession();
    },

    signIn: function(email, password){
      return client.auth.signInWithPassword({ email: email, password: password });
    },

    // Forny sessionen (bruges før vi giver op og logger ud)
    refresh: function(){
      return client.auth.refreshSession();
    },

    // scope:'local' er vigtigt: det fælles login bruges af mange telefoner
    // på samme tid. Et globalt signOut ville logge ALLE andre ud.
    signOut: function(){
      return client.auth.signOut({ scope: 'local' });
    },

    // ---- Medarbejdere ("Hvem er du?") ----
    staff: function(){
      return client.from('la2_staff')
        .select('id,navn')
        .eq('aktiv', true)
        .then(unwrap)
        .then(function(rows){
          return rows.sort(function(a, b){ return a.navn.localeCompare(b.navn, 'da'); });
        });
    },

    addStaff: function(navn){
      return client.from('la2_residents').select('botilbud_id').limit(1)
        .then(unwrap)
        .then(function(rows){
          if(!rows.length) throw new Error('Intet botilbud fundet');
          return client.from('la2_staff')
            .insert({ navn: navn, botilbud_id: rows[0].botilbud_id })
            .then(unwrap);
        });
    },

    // ---- Beboere (indstillinger + navn/farve) ----
    residents: function(){
      return client.from('la2_residents')
        .select('id,resident_id,botilbud_id,variant,contact_persons,beboere(navn,farve,sortering)')
        .then(unwrap)
        .then(function(rows){
          return rows.sort(function(a, b){
            var sa = a.beboere ? a.beboere.sortering : 0;
            var sb = b.beboere ? b.beboere.sortering : 0;
            return sa - sb;
          });
        });
    },

    updateResident: function(id, fields){
      return client.from('la2_residents').update(fields).eq('id', id).select('id').then(unwrap);
    },

    // ---- Planer: fuld række (inkl. indhold) for én beboer og plantype ----
    // Bruges kun af beboerens plansider; indholdet holdes kun i hukommelsen.
    plansForResident: function(residentId, planType, medIndhold){
      return client.from('la2_plans')
        .select(medIndhold === false ? PLAN_META : PLAN_FULL)
        .eq('resident_id', residentId)
        .eq('plan_type', planType)
        .order('updated_at', { ascending: false })
        .then(unwrap);
    },

    planGroup: function(groupId){
      return client.from('la2_plans')
        .select(PLAN_FULL)
        .eq('episode_group_id', groupId)
        .then(unwrap);
    },

    createPlan: function(fields){
      return client.from('la2_plans').insert(fields).select(PLAN_FULL).then(unwrap);
    },

    // Optimistisk lås: opdaterer kun hvis rækken ikke er ændret siden den blev hentet.
    // Returnerer [] hvis en anden har ændret planen imens.
    updatePlan: function(id, fields, forventetUpdatedAt){
      return client.from('la2_plans')
        .update(fields)
        .eq('id', id)
        .eq('updated_at', forventetUpdatedAt)
        .select(PLAN_FULL)
        .then(unwrap);
    },

    versions: function(planId){
      return client.from('la2_plan_versions')
        .select('id,version_no,status,is_draft,edited_by_name,edited_at')
        .eq('plan_id', planId)
        .order('version_no', { ascending: false })
        .then(unwrap);
    },

    version: function(versionId){
      return client.from('la2_plan_versions')
        .select('id,version_no,title,content,filled_with,status,is_draft,edited_by_name,edited_at')
        .eq('id', versionId)
        .then(unwrap);
    },

    // ---- Sammenlign: noter og markeringer (mødedata, ændrer aldrig planerne) ----
    // Alle noter for et planpar (uanset version og rækkefølge)
    compareNotes: function(planA, planB){
      return client.from('la2_compare_notes')
        .select('*')
        .in('left_plan_id', [planA, planB])
        .in('right_plan_id', [planA, planB])
        .then(unwrap);
    },

    compareNoteInsert: function(fields){
      return client.from('la2_compare_notes').insert(fields).select('*').then(unwrap);
    },

    compareNoteUpdate: function(id, fields){
      return client.from('la2_compare_notes').update(fields).eq('id', id).select('*').then(unwrap);
    },

    // ---- Sammenlign: "Begge er enige" (tre bunker). Ingen versioner, ingen update:
    // et par oprettes ved at slette rækken og oprette en ny ----
    compareCommon: function(planA, planB){
      return client.from('la2_compare_common')
        .select('*')
        .in('left_plan_id', [planA, planB])
        .in('right_plan_id', [planA, planB])
        .order('created_at', { ascending: true })
        .then(unwrap);
    },

    commonInsert: function(fields){
      return client.from('la2_compare_common').insert(fields).select('*').then(unwrap);
    },

    commonDelete: function(id){
      return client.from('la2_compare_common').delete().eq('id', id).select('id').then(unwrap);
    },

    // ---- Feedet (samme som infoskærmen): metadata for AKTIVE planer ----
    screenFeed: function(){
      return client.rpc('la2_screen_feed').then(unwrap);
    },

    // ---- Kun kurve-tallene fra aktive læringsplaner siden en dato ----
    // (til sparklinen i overblikket — resten af indholdet hentes ikke)
    laeringKurver: function(sidenISO){
      return client.from('la2_plans')
        .select('resident_id,episode_group_id,episode_date,curve:content->curve')
        .eq('plan_type', 'laering')
        .eq('status', 'aktiv')
        .gte('episode_date', sidenISO)
        .then(unwrap);
    },

    // ---- Planer: KUN metadata til overblikket (aldrig content) ----
    plansMeta: function(){
      return client.from('la2_plans')
        .select('id,resident_id,plan_type,perspective,status,review_due,updated_at,updated_by_name,episode_date,episode_group_id,created_at')
        .neq('status', 'arkiv')
        .then(unwrap);
    }
  };
})();
