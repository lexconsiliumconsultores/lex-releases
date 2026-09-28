// Migra lex.db (sql.js) -> Supabase Postgres (via pg pooler)
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { Client } = require('pg');

const cfg = require('./supabase-config.json');
const appDataDb = path.join(process.env.APPDATA || '', 'lex', 'lex.db');
const localDbPath = fs.existsSync(appDataDb) ? appDataDb : path.join(__dirname, '..', 'lex.db');

async function migrate() {
  console.log('Origen:', localDbPath, fs.existsSync(localDbPath) ? `(${(fs.statSync(localDbPath).length/1024).toFixed(1)} KB)` : 'NO EXISTE');
  if (!fs.existsSync(localDbPath)) { console.error('No se encontró lex.db'); return; }

  const SQL = await initSqlJs({ locateFile: f => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f) });
  const buf = fs.readFileSync(localDbPath);
  const db = new SQL.Database(buf);

  function qAll(sql, params=[]) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const r=[]; while(stmt.step()) r.push(stmt.getAsObject()); stmt.free(); return r;
  }

  // Conectar a Supabase Postgres (pooler sa-east-1)
  const client = new Client({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${cfg.projectRef}`,
    password: cfg.dbPassword,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Conectado a Supabase Postgres');

  // Verificar si ya hay datos (evitar duplicar)
  const existing = await client.query('SELECT COUNT(*) as c FROM clientes');
  if (parseInt(existing.rows[0].c) > 0) {
    console.log(`⚠️  Supabase ya tiene ${existing.rows[0].c} clientes, omitiendo migración para no duplicar.`);
    console.log('Si quieres forzar re-migración, vacía las tablas primero en SQL Editor.');
    await client.end();
    db.close();
    return;
  }

  const tablas = [
    { name: 'clientes', cols: ['id','nombre','cedula','telefono','email','direccion','fecha_registro'] },
    { name: 'usuarios', cols: ['id','usuario','nombre','password','rol','activo','fecha_creacion'] },
    { name: 'config', cols: ['clave','valor'] },
    { name: 'casos', cols: ['id','numero_caso','titulo','cliente_id','tipo','estado','descripcion','fecha_apertura','fecha_cierre','abogado'] },
    { name: 'documentos', cols: ['id','caso_id','nombre','tipo','ruta','fecha_subida'] },
    { name: 'plazos', cols: ['id','caso_id','titulo','fecha_limite','hora','estado','notas','outlook_event_id'] },
    { name: 'seguimiento', cols: ['id','caso_id','fecha','nota','autor'] },
    { name: 'facturas', cols: ['id','numero','caso_id','cliente_id','concepto','monto','estado','fecha_emision','fecha_vencimiento'] },
    { name: 'pagos', cols: ['id','factura_id','monto','fecha','metodo','referencia'] },
    { name: 'documentos_generados', cols: ['id','titulo','tipo','caso_id','contenido','fecha_creacion'] },
    { name: 'conversaciones_chat', cols: ['id','titulo','usuario','contenido','fecha_guardado'] },
    { name: 'notificaciones', cols: ['id','caso_id','cliente_id','tipo','mensaje','telefono','email','canal','estado','fecha','asunto'] },
  ];

  for (const t of tablas) {
    const colsStr = t.cols.join(', ');
    let rows;
    try { rows = qAll(`SELECT ${colsStr} FROM ${t.name}`); } catch(e){ console.log(`  Tabla ${t.name} no existe en local, skip`); continue; }
    if (rows.length===0) { console.log(`  ${t.name}: 0 filas`); continue; }
    console.log(`  Migrando ${t.name}: ${rows.length} filas...`);
    for (const row of rows) {
      const vals = t.cols.map(c => row[c]);
      const placeholders = t.cols.map((_,i)=>`$${i+1}`).join(',');
      const sql = `INSERT INTO ${t.name} (${colsStr}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      try { await client.query(sql, vals); } catch(e){ console.error(`    Error ${t.name} id=${row.id}:`, e.message); }
    }
    // Reset sequence para BIGINT identity
    if (t.cols.includes('id')) {
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('${t.name}','id'), COALESCE((SELECT MAX(id) FROM ${t.name}),0)+1, false)`);
      } catch(e){}
    }
  }

  // Verificación final
  for (const t of ['clientes','casos','plazos','facturas','usuarios']) {
    const r = await client.query(`SELECT COUNT(*) as c FROM ${t}`);
    console.log(`  ✓ ${t}: ${r.rows[0].c} filas en Supabase`);
  }

  await client.end();
  db.close();
  console.log('\n✅ Migración completada. Datos PC ahora en Supabase.');
  console.log('Próximo: conectar main.js para que use Supabase en vivo.');
}

migrate().catch(e=>{ console.error(e); process.exit(1); });
