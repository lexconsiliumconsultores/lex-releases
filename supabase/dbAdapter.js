const fs = require('fs');
const path = require('path');

let enabled = false;
let cfg = null;
let cloudColumns = {};

function loadConfig() {
  try {
    const cfgPath = path.join(__dirname, 'supabase-config.json');
    if (!fs.existsSync(cfgPath)) return null;
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch { return null; }
}

function headers(extra) {
  return Object.assign({ apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }, extra || {});
}

async function initSupabase() {
  cfg = loadConfig();
  if (!cfg || !cfg.url || !cfg.key) {
    console.log('[Supabase] No configurado (supabase-config.json no encontrado o incompleto)');
    return false;
  }
  try {
    const res = await fetch(cfg.url + '/rest/v1/', { headers: headers(), signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const spec = await res.json();
    cloudColumns = {};
    for (const [table, def] of Object.entries(spec.definitions || {})) {
      cloudColumns[table] = Object.keys(def.properties || {});
    }
    enabled = true;
    console.log('[Supabase] Conectado REST ->', cfg.url);
    return true;
  } catch (e) {
    console.warn('[Supabase] Sin conexion, modo local:', e.message);
    enabled = false;
    return false;
  }
}

function isEnabled() { return enabled; }

async function pullRows(table) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?select=*`, { headers: headers(), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function pushRows(table, rows, conflictCol = 'id') {
  if (!rows || !rows.length) return 0;
  const cols = cloudColumns[table];
  let clean = rows;
  if (cols && cols.length) {
    clean = rows.map(r => {
      const o = {};
      for (const k of Object.keys(r)) if (cols.includes(k)) o[k] = r[k];
      return o;
    }).filter(o => Object.keys(o).length);
  }
  if (!clean.length) return 0;
  const res = await fetch(`${cfg.url}/rest/v1/${table}?on_conflict=${conflictCol}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(clean),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return clean.length;
}

async function deleteRow(table, keyCol, value) {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${keyCol}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: headers(),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

module.exports = { initSupabase, isEnabled, pullRows, pushRows, deleteRow, loadConfig };
