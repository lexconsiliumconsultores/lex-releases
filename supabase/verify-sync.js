const { Pool } = require('pg');
const cfg = require('./supabase-config.json');
const pool = new Pool({
  host: 'aws-0-sa-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: `postgres.${cfg.projectRef}`,
  password: cfg.dbPassword,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const c = await pool.connect();
  try {
    const tables = ['clientes','casos','plazos','facturas','pagos','notificaciones','usuarios','config'];
    for (const t of tables) {
      const r = await c.query(`SELECT COUNT(*) as c FROM ${t}`);
      console.log(`${t}: ${r.rows[0].c} filas`);
    }
    // Probar insert via pg y verificar que se puede leer via supabase-js
    const { createClient } = require('@supabase/supabase-js');
    const supa = createClient(cfg.url, cfg.publishable);
    const { data, error } = await supa.from('clientes').select('*').limit(1);
    console.log('\nSupabase-js read clientes:', error ? error.message : `OK ${data.length} rows, ej: ${data[0]?.nombre || 'vacio'}`);
    
    // Probar insert dual-write simulado
    console.log('\nProbando insert de prueba via pg...');
    const testName = 'TEST_SYNC_' + Date.now();
    const ins = await c.query(`INSERT INTO clientes (nombre, cedula, email) VALUES ($1,$2,$3) RETURNING id`, [testName, 'TEST'+Date.now(), 'test@lex.cl']);
    console.log('Insert OK id:', ins.rows[0].id);
    const check = await c.query(`SELECT * FROM clientes WHERE id=$1`, [ins.rows[0].id]);
    console.log('Verificado:', check.rows[0].nombre);
    // Borrar prueba
    await c.query(`DELETE FROM clientes WHERE id=$1`, [ins.rows[0].id]);
    console.log('Borrado prueba OK');
  } finally {
    c.release();
    await pool.end();
  }
}
run().catch(e=>{console.error(e); process.exit(1)});
