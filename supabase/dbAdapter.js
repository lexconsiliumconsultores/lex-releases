const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;
let enabled = false;

function loadConfig() {
  try {
    const cfgPath = path.join(__dirname, 'supabase-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch { return null; }
}

async function initSupabase() {
  const cfg = loadConfig();
  if (!cfg || !cfg.projectRef || !cfg.dbPassword) {
    console.log('[Supabase] No configurado (supabase-config.json no encontrado)');
    return false;
  }
  pool = new Pool({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${cfg.projectRef}`,
    password: cfg.dbPassword,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000
  });
  try {
    const c = await pool.connect();
    await c.query('SELECT 1');
    c.release();
    enabled = true;
    console.log('[Supabase] Conectado pooler sa-east-1:6543 ->', cfg.url);
    return true;
  } catch (e) {
    console.warn('[Supabase] No se pudo conectar, usando BD local:', e.message);
    enabled = false;
    try { await pool.end(); } catch {}
    pool = null;
    return false;
  }
}

function isEnabled() { return enabled && pool; }

// Convierte "?" placeholders de sql.js a "$1,$2..." de pg
function toPg(sql, params) {
  let idx = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
  return { pgSql, pgParams: params };
}

async function queryAll(sql, params=[]) {
  if (!isEnabled()) return null;
  const { pgSql, pgParams } = toPg(sql, params);
  const res = await pool.query(pgSql, pgParams);
  return res.rows;
}

async function queryOne(sql, params=[]) {
  if (!isEnabled()) return null;
  const { pgSql, pgParams } = toPg(sql, params);
  const res = await pool.query(pgSql, pgParams);
  return res.rows[0] || null;
}

async function runQuery(sql, params=[]) {
  if (!isEnabled()) return null;
  const trimmed = sql.trim().toUpperCase();
  const isInsert = trimmed.startsWith('INSERT');
  const { pgSql, pgParams } = toPg(sql, params);
  // Para INSERT, intentar RETURNING id si no lo tiene
  let finalSql = pgSql;
  if (isInsert && !/RETURNING/i.test(pgSql)) {
    finalSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
  }
  const res = await pool.query(finalSql, pgParams);
  const lastId = res.rows && res.rows[0] ? res.rows[0].id : null;
  return { changes: res.rowCount, lastId: lastId, rows: res.rows };
}

module.exports = { initSupabase, isEnabled, queryAll, queryOne, runQuery, loadConfig };
