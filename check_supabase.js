const {initSupabase, isEnabled, queryAll} = require('./supabase/dbAdapter');

initSupabase().then(() => {
  console.log('Supabase enabled:', isEnabled());
  if (isEnabled()) {
    Promise.all([
      queryAll('SELECT count(*) as cnt FROM usuarios'),
      queryAll('SELECT count(*) as cnt FROM clientes'),
      queryAll('SELECT count(*) as cnt FROM casos'),
      queryAll('SELECT count(*) as cnt FROM plazos'),
      queryAll('SELECT count(*) as cnt FROM facturas')
    ]).then(results => {
      console.log('--- Resultados Supabase ---');
      console.log('Usuarios:', results[0]);
      console.log('Clientes:', results[1]);
      console.log('Casos:', results[2]);
      console.log('Plazos:', results[3]);
      console.log('Facturas:', results[4]);
    }).catch(e => console.error('Query error:', e));
  } else {
    console.log('Supabase no enabled, using local DB only');
  }
}).catch(e => console.error('Init error:', e));