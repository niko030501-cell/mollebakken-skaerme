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

    // ---- Planer: KUN metadata til overblikket (aldrig content) ----
    plansMeta: function(){
      return client.from('la2_plans')
        .select('id,resident_id,plan_type,perspective,status,review_due,updated_at,updated_by_name,episode_date,episode_group_id,created_at')
        .neq('status', 'arkiv')
        .then(unwrap);
    }
  };
})();
