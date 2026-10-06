const { app, BrowserWindow, ipcMain, dialog, Menu, Notification } = require('electron');
const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { autoUpdater } = require('electron-updater');
const supaAdapter = require('./supabase/dbAdapter');

let mainWindow;
let db;
let dbPath;
let currentUser = null;

function getDbPath() {
  return path.join(app.getPath('userData'), 'lex.db');
}

let dbDirty = false;
let dbSaveTimer = null;
let dbWriting = false;

// Guardado con debounce: la BD (sql.js, en memoria) solo se exporta a disco
// cuando deja de haber escrituras (300ms) y en segundo plano, para no bloquear
// la UI con db.export() + writeFileSync en cada INSERT/UPDATE/DELETE.
function saveDbNowSync() {
  if (!db) return;
  if (dbSaveTimer) {
    clearTimeout(dbSaveTimer);
    dbSaveTimer = null;
  }
  dbDirty = false;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

async function persistDbAsync() {
  if (!db) return;
  if (dbWriting) return;
  dbDirty = false;
  dbWriting = true;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    await fs.promises.writeFile(dbPath, buffer);
  } catch (err) {
    console.error('Error guardando la base de datos:', err);
  } finally {
    dbWriting = false;
  }
}

function saveDb() {
  saveDbNowSync();
}

function scheduleDbSave() {
  if (!db || dbWriting) return;
  dbDirty = true;
  if (dbSaveTimer) clearTimeout(dbSaveTimer);
  dbSaveTimer = setTimeout(() => {
    dbSaveTimer = null;
    if (dbDirty) persistDbAsync();
  }, 300);
}

let backgroundSyncInterval = null;
let syncDebounceTimer = null;
let syncRunning = false;

function startBackgroundSync() {
  if (backgroundSyncInterval) clearInterval(backgroundSyncInterval);
  backgroundSyncInterval = setInterval(() => { syncNow().catch(() => {}); }, 180000);
}

// Tras cada guardado local, sube cambios a la nube 10s despu�s (sin bloquear UI)
function scheduleSyncPush() {
  if (!supaAdapter.isEnabled()) return;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    syncNow().catch(() => {});
  }, 10000);
}

// Orden por dependencias (FK): padres primero. config va aparte (PK = clave).
const SYNC_TABLES = ['usuarios', 'clientes', 'casos', 'plazos', 'seguimiento', 'documentos', 'facturas', 'pagos', 'notificaciones', 'documentos_generados', 'conversaciones_chat', 'config'];

function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + label)), ms))]);
}

async function syncNow() {
  if (!supaAdapter.isEnabled()) return { success: false, error: 'Supabase no configurado o sin conexi�n' };
  if (syncRunning) return { success: false, error: 'Sync en curso' };
  syncRunning = true;
  const resumen = { bajados: 0, subidos: 0, borradosNube: 0, borradosLocal: 0, errores: [] };
  try {
    // 0) Empujar borrados locales a la nube
    for (const del of queryAll('SELECT tabla, ref_id FROM eliminados')) {
      const keyCol = del.tabla === 'config' ? 'clave' : 'id';
      try {
        await withTimeout(supaAdapter.deleteRow(del.tabla, keyCol, del.ref_id), 20000, 'delete');
        db.run('DELETE FROM eliminados WHERE tabla=? AND ref_id=?', [del.tabla, del.ref_id]);
        resumen.borradosNube++;
      } catch (e) { resumen.errores.push(`delete-nube ${del.tabla}/${del.ref_id}: ${e.message}`); }
    }
    // 1) Pull: insertar filas nuevas de la nube + detectar borrados remotos
    for (const t of SYNC_TABLES) {
      let rows;
      try { rows = await withTimeout(supaAdapter.pullRows(t), 20000, 'pull'); } catch (e) { resumen.errores.push(`pull ${t}: ${e.message}`); continue; }
      const keyCol = t === 'config' ? 'clave' : 'id';
      const localCols = queryAll(`PRAGMA table_info(${t})`).map(c => c.name);
      if (!localCols.length) continue;
      const cloudIds = new Set(rows.map(r => String(r[keyCol])));
      const pendingDel = new Set(queryAll('SELECT ref_id FROM eliminados WHERE tabla=?', [t]).map(r => String(r.ref_id)));
      // 1a) insertar localmente las filas de la nube que no existan local
      for (const row of rows) {
        const key = row[keyCol];
        if (key == null) continue;
        if (queryOne(`SELECT ${keyCol} FROM ${t} WHERE ${keyCol}=?`, [key])) continue;
        const cols = Object.keys(row).filter(c => localCols.includes(c));
        if (!cols.length) continue;
        const vals = cols.map(c => {
          const v = row[c];
          if (typeof v === 'boolean') return v ? 1 : 0;
          if (v !== null && typeof v === 'object') return JSON.stringify(v);
          return v;
        });
        try {
          db.run(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, vals);
          resumen.bajados++;
        } catch (e) { resumen.errores.push(`insert ${t}: ${e.message}`); }
      }
      // 1b) borrado en otro dispositivo: estaba en la nube y ya no est�
      for (const known of queryAll('SELECT ref_id FROM sync_known WHERE tabla=?', [t])) {
        const id = String(known.ref_id);
        if (!cloudIds.has(id) && !pendingDel.has(id) && queryOne(`SELECT ${keyCol} FROM ${t} WHERE ${keyCol}=?`, [id])) {
          try {
            db.run(`DELETE FROM ${t} WHERE ${keyCol}=?`, [id]);
            resumen.borradosLocal++;
          } catch (e) { resumen.errores.push(`delete-local ${t}/${id}: ${e.message}`); }
        }
      }
      // 1c) actualizar registro de ids conocidos en la nube
      db.run('DELETE FROM sync_known WHERE tabla=?', [t]);
      for (const id of cloudIds) db.run('INSERT OR IGNORE INTO sync_known (tabla, ref_id) VALUES (?, ?)', [t, id]);
    }
    // 2) Push: upsert de todas las filas locales a la nube
    for (const t of SYNC_TABLES) {
      const rows = queryAll(`SELECT * FROM ${t}`);
      if (!rows.length) continue;
      const conflictCol = t === 'config' ? 'clave' : 'id';
      try { resumen.subidos += await withTimeout(supaAdapter.pushRows(t, rows, conflictCol), 30000, 'push'); }
      catch (e) { resumen.errores.push(`push ${t}: ${e.message}`); }
    }
    scheduleDbSave();
    procesarNotificacionesPendientes().catch(() => {});
    console.log('[Sync] OK bajados:', resumen.bajados, 'subidos:', resumen.subidos, resumen.errores.length ? 'errores: ' + resumen.errores.join(' | ') : '');
    return { success: true, ...resumen };
  } catch (e) {
    return { success: false, error: e.message, ...resumen };
  } finally {
    syncRunning = false;
  }
}

async function procesarNotificacionesPendientes() {
  try {
    const pendientes = queryAll("SELECT * FROM notificaciones WHERE estado = 'Pendiente' AND email IS NOT NULL AND email <> '' LIMIT 20");
    if (!pendientes.length) return;
    const tokenOutlook = await getOutlookAccessToken();
    for (const n of pendientes) {
      const asunto = `LEX - ${n.tipo || 'Notificación'}`;
      let res;
      if (tokenOutlook) {
        res = await sendMailOutlookDirect(n.email, asunto, n.mensaje || '');
        if (!res.success) res = await enviarPorSMTP(n.email, asunto, n.mensaje || '');
      } else {
        res = await enviarPorSMTP(n.email, asunto, n.mensaje || '');
      }
      if (res && res.success) {
        runQuery("UPDATE notificaciones SET estado='Enviado', canal=COALESCE(canal, 'Outlook') WHERE id=?", [n.id]);
      } else {
        runQuery("UPDATE notificaciones SET estado='Fallido' WHERE id=?", [n.id]);
      }
    }
    scheduleSyncPush();
  } catch (e) {
    console.error('Error procesando notificaciones pendientes:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'LEX - Sistema de Gesti�n Jur�dica',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile('index.html');
  mainWindow.maximize();

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow.reload();
    }
  });

  const menu = Menu.buildFromTemplate([]);
  Menu.setApplicationMenu(menu);

  mainWindow.on('close', () => {
    if (dbSaveTimer) {
      clearTimeout(dbSaveTimer);
      dbSaveTimer = null;
    }
  });
}

async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });
  dbPath = getDbPath();
  
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      cedula TEXT UNIQUE,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      id_tramite TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS casos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_caso TEXT UNIQUE NOT NULL,
      titulo TEXT NOT NULL,
      cliente_id INTEGER,
      tipo TEXT,
      estado TEXT DEFAULT 'Activo',
      descripcion TEXT,
      fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_cierre DATETIME,
      abogado TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS documentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caso_id INTEGER,
      nombre TEXT NOT NULL,
      tipo TEXT,
      ruta TEXT,
      fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (caso_id) REFERENCES casos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS plazos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caso_id INTEGER,
      titulo TEXT NOT NULL,
      fecha_limite DATETIME,
      hora TEXT,
      estado TEXT DEFAULT 'Pendiente',
      notas TEXT,
      FOREIGN KEY (caso_id) REFERENCES casos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS seguimiento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caso_id INTEGER,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      nota TEXT NOT NULL,
      autor TEXT,
      FOREIGN KEY (caso_id) REFERENCES casos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER UNIQUE,
      caso_id INTEGER,
      cliente_id INTEGER,
      concepto TEXT,
      monto REAL DEFAULT 0,
      estado TEXT DEFAULT 'Pendiente',
      fecha_emision DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_vencimiento DATETIME,
      FOREIGN KEY (caso_id) REFERENCES casos(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER,
      monto REAL NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      metodo TEXT,
      referencia TEXT,
      FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS documentos_generados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      tipo TEXT,
      caso_id INTEGER,
      contenido TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (caso_id) REFERENCES casos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversaciones_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      usuario TEXT,
      contenido TEXT,
      fecha_guardado DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caso_id INTEGER,
      cliente_id INTEGER,
      tipo TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      telefono TEXT,
      estado TEXT DEFAULT 'Enviado',
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (caso_id) REFERENCES casos(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      password TEXT NOT NULL,
      rol TEXT DEFAULT 'asistente',
      activo INTEGER DEFAULT 1,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);

  const userCount = queryOne('SELECT COUNT(*) as total FROM usuarios').total;
  if (userCount === 0) {
    runQuery(
      'INSERT INTO usuarios (usuario, nombre, password, rol, activo) VALUES (?, ?, ?, ?, ?)',
      ['admin', 'Administrador', 'admin123', 'administrador', 1]
    );
  }

  const colsNotif = queryAll('PRAGMA table_info(notificaciones)').map(c => c.name);
  if (!colsNotif.includes('email')) {
    db.run('ALTER TABLE notificaciones ADD COLUMN email TEXT');
  }
  if (!colsNotif.includes('canal')) {
    db.run('ALTER TABLE notificaciones ADD COLUMN canal TEXT');
  }
  if (!colsNotif.includes('asunto')) {
    db.run('ALTER TABLE notificaciones ADD COLUMN asunto TEXT');
  }

  const colsPlazos = queryAll('PRAGMA table_info(plazos)').map(c => c.name);
  if (!colsPlazos.includes('outlook_event_id')) {
    db.run('ALTER TABLE plazos ADD COLUMN outlook_event_id TEXT');
  }

  const colsClientes = queryAll('PRAGMA table_info(clientes)').map(c => c.name);
  if (!colsClientes.includes('id_tramite')) {
    db.run('ALTER TABLE clientes ADD COLUMN id_tramite TEXT');
  }

  // Tablas de control de sincronizaci�n (solo locales, no se suben)
  db.run(`CREATE TABLE IF NOT EXISTS eliminados (
    tabla TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    fecha TEXT,
    PRIMARY KEY (tabla, ref_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sync_known (
    tabla TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    PRIMARY KEY (tabla, ref_id)
  )`);

  saveDb();
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function runQuery(sql, params = []) {
  db.run(sql, params);
  scheduleDbSave();
  scheduleSyncPush();
  return { changes: db.getRowsModified(), lastId: queryOne('SELECT last_insert_rowid() as id').id };
}

// Registra el borrado para propagarlo a la nube y luego elimina localmente
function borrarRegistro(tabla, id) {
  runQuery('INSERT OR REPLACE INTO eliminados (tabla, ref_id, fecha) VALUES (?, ?, ?)', [tabla, String(id), new Date().toISOString()]);
  runQuery(`DELETE FROM ${tabla} WHERE id=?`, [id]);
}

// Configuraci�n (pares clave-valor)
function getConfig(clave) {
  const row = queryOne('SELECT valor FROM config WHERE clave=?', [clave]);
  return row ? row.valor : null;
}

function setConfig(clave, valor) {
  runQuery(
    'INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor',
    [clave, valor]
  );
}

function getSMTPConfig() {
  return {
    host: getConfig('smtp_host') || '',
    port: getConfig('smtp_port') || '587',
    user: getConfig('smtp_user') || '',
    pass: getConfig('smtp_pass') || '',
    from: getConfig('smtp_from') || ''
  };
}

// Clientes
ipcMain.handle('getClientes', () => {
  return queryAll('SELECT * FROM clientes ORDER BY nombre');
});

ipcMain.handle('addCliente', (event, cliente) => {
  return runQuery(
    'INSERT INTO clientes (nombre, cedula, telefono, email, direccion, id_tramite) VALUES (?, ?, ?, ?, ?, ?)',
    [cliente.nombre, cliente.cedula, cliente.telefono, cliente.email, cliente.direccion, cliente.id_tramite]
  );
});

ipcMain.handle('updateCliente', (event, cliente) => {
  runQuery(
    'UPDATE clientes SET nombre=?, cedula=?, telefono=?, email=?, direccion=?, id_tramite=? WHERE id=?',
    [cliente.nombre, cliente.cedula, cliente.telefono, cliente.email, cliente.direccion, cliente.id_tramite, cliente.id]
  );
  return { success: true };
});

ipcMain.handle('deleteCliente', (event, id) => {
  borrarRegistro('clientes', id);
  return { success: true };
});

// Generar n�mero de caso autom�tico
function generarNumeroCaso() {
  const year = new Date().getFullYear();
  const last = queryOne(
    "SELECT numero_caso FROM casos WHERE numero_caso LIKE ? ORDER BY id DESC LIMIT 1",
    [`CASO-${year}-%`]
  );
  let num = 1;
  if (last && last.numero_caso) {
    const parts = last.numero_caso.split('-');
    num = parseInt(parts[2]) + 1;
  }
  return `CASO-${year}-${String(num).padStart(4, '0')}`;
}

ipcMain.handle('generarNumeroCaso', () => {
  return generarNumeroCaso();
});

// Casos
ipcMain.handle('getCasos', () => {
  return queryAll(`
    SELECT c.*, cl.nombre as cliente_nombre 
    FROM casos c 
    LEFT JOIN clientes cl ON c.cliente_id = cl.id 
    ORDER BY c.fecha_apertura DESC
  `);
});

ipcMain.handle('addCaso', (event, caso) => {
  const numeroCaso = generarNumeroCaso();
  return runQuery(
    'INSERT INTO casos (numero_caso, titulo, cliente_id, tipo, descripcion, abogado) VALUES (?, ?, ?, ?, ?, ?)',
    [numeroCaso, caso.titulo, caso.cliente_id, caso.tipo, caso.descripcion, caso.abogado]
  );
});

ipcMain.handle('updateCaso', (event, caso) => {
  runQuery(
    'UPDATE casos SET titulo=?, cliente_id=?, tipo=?, estado=?, descripcion=?, abogado=? WHERE id=?',
    [caso.titulo, caso.cliente_id, caso.tipo, caso.estado, caso.descripcion, caso.abogado, caso.id]
  );
  return { success: true };
});

ipcMain.handle('deleteCaso', (event, id) => {
  borrarRegistro('casos', id);
  return { success: true };
});

// Documentos
ipcMain.handle('getDocumentos', (event, casoId) => {
  if (casoId) {
    return queryAll('SELECT * FROM documentos WHERE caso_id=? ORDER BY fecha_subida DESC', [casoId]);
  }
  return queryAll('SELECT * FROM documentos ORDER BY fecha_subida DESC');
});

ipcMain.handle('addDocumento', (event, doc) => {
  return runQuery(
    'INSERT INTO documentos (caso_id, nombre, tipo, ruta) VALUES (?, ?, ?, ?)',
    [doc.caso_id, doc.nombre, doc.tipo, doc.ruta]
  );
});

ipcMain.handle('deleteDocumento', (event, id) => {
  borrarRegistro('documentos', id);
  return { success: true };
});

const MIME_DOCS = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.txt': 'text/plain', '.md': 'text/markdown',
  '.html': 'text/html', '.htm': 'text/html',
  '.csv': 'text/csv', '.json': 'application/json'
};

ipcMain.handle('getDocumentoBase64', (event, id) => {
  const doc = queryOne('SELECT * FROM documentos WHERE id=?', [id]);
  if (!doc) return { success: false, error: 'Documento no encontrado' };
  try {
    if (!doc.ruta || !fs.existsSync(doc.ruta)) {
      return { success: false, error: 'El archivo ya no existe en la ruta registrada:\n' + (doc.ruta || '(sin ruta)') };
    }
    const stats = fs.statSync(doc.ruta);
    if (stats.size > 25 * 1024 * 1024) {
      return { success: false, error: 'El archivo supera 25 MB y es demasiado grande para el visor interno. Desc�rgalo para revisarlo.' };
    }
    const ext = path.extname(doc.ruta).toLowerCase();
    const mime = MIME_DOCS[ext] || 'application/octet-stream';
    const base64 = fs.readFileSync(doc.ruta).toString('base64');
    return { success: true, base64, mime, nombre: doc.nombre };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('selectFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile']
  });
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// Plazos
ipcMain.handle('getPlazos', (event, casoId) => {
  if (casoId) {
    return queryAll(
      'SELECT p.*, c.titulo as caso_titulo FROM plazos p JOIN casos c ON p.caso_id = c.id WHERE p.caso_id=? ORDER BY p.fecha_limite',
      [casoId]
    );
  }
  return queryAll(
    'SELECT p.*, c.titulo as caso_titulo FROM plazos p JOIN casos c ON p.caso_id = c.id ORDER BY p.fecha_limite'
  );
});

function syncPlazosActivo() {
  return getConfig('outlook_sync_plazos') === '1';
}

function formatoIsoGraph(date) {
  const offset = -4 * 60;
  const local = new Date(date.getTime() + offset * 60000);
  return `${local.toISOString().slice(0, 19)}-04:00`;
}

function fechaGarantizada(fecha, hora) {
  const f = String(fecha || '').split('T')[0];
  const h = hora || '09:00';
  return { fechaBase: f, horaBase: h, fecha: `${f}T${h}:00` };
}

async function crearEventoParaPlazo(plazo) {
  const guia = fechaGarantizada(plazo.fecha_limite, plazo.hora);
  if (!guia.fechaBase) return { success: false, error: 'Fecha de plazo inv�lida' };
  const inicio = new Date(guia.fecha);
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
  const caso = plazo.caso_id ? queryOne('SELECT titulo FROM casos WHERE id=?', [plazo.caso_id]) : null;
  const ev = {
    subject: `[LEX] ${plazo.titulo}${caso ? ' - ' + caso.titulo : ''}`,
    content: plazo.notas || '',
    start: { dateTime: formatoIsoGraph(inicio), timeZone: 'America/Caracas' },
    end: { dateTime: formatoIsoGraph(fin), timeZone: 'America/Caracas' },
    isReminderOn: true,
    reminderMinutesBeforeStart: 1440
  };
  return createOutlookEventDirect(ev);
}

async function actualizarEventoOutlook(evId, plazo) {
  const caso = plazo.caso_id ? queryOne('SELECT titulo FROM casos WHERE id=?', [plazo.caso_id]) : null;
  const ev = {};
  if (plazo.titulo) ev.subject = `[LEX] ${plazo.titulo}${caso ? ' - ' + caso.titulo : ''}`;
  const guia = fechaGarantizada(plazo.fecha_limite, plazo.hora);
  if (guia.fechaBase) {
    const inicio = new Date(guia.fecha);
    const fin = new Date(inicio.getTime() + 60 * 60 * 1000);
    ev.start = { dateTime: formatoIsoGraph(inicio), timeZone: 'America/Caracas' };
    ev.end = { dateTime: formatoIsoGraph(fin), timeZone: 'America/Caracas' };
  }
  if (plazo.notas !== undefined && plazo.notas !== null) {
    ev.body = { contentType: 'text', content: plazo.notas };
  }
  return updateOutlookEventDirect(evId, ev);
}

async function borrarEventoOutlook(evId) {
  return deleteOutlookEventDirect(evId);
}

async function insertarPlazoConSync(plazo) {
  const res = runQuery(
    'INSERT INTO plazos (caso_id, titulo, fecha_limite, hora, notas) VALUES (?, ?, ?, ?, ?)',
    [plazo.caso_id, plazo.titulo, plazo.fecha_limite || null, plazo.hora || null, plazo.notas || null]
  );
  const id = res.lastId;
  if (syncPlazosActivo()) {
    crearEventoParaPlazo({ ...plazo, id }).then(ev => {
      if (ev.success && ev.id) {
        runQuery('UPDATE plazos SET outlook_event_id=? WHERE id=?', [ev.id, id]);
      }
    }).catch(() => {});
  }
  return res;
}

ipcMain.handle('addPlazo', async (event, plazo) => {
  return insertarPlazoConSync(plazo);
});

ipcMain.handle('updatePlazo', async (event, plazo) => {
  let outlookId = null;
  if (plazo.caso_id && plazo.titulo && plazo.fecha_limite) {
    runQuery(
      'UPDATE plazos SET caso_id=?, titulo=?, fecha_limite=?, hora=?, estado=?, notas=? WHERE id=?',
      [plazo.caso_id, plazo.titulo, plazo.fecha_limite, plazo.hora || '', plazo.estado, plazo.notas || '', plazo.id]
    );
    const row = queryOne('SELECT outlook_event_id FROM plazos WHERE id=?', [plazo.id]);
    outlookId = row ? row.outlook_event_id : null;
  } else {
    runQuery(
      'UPDATE plazos SET estado=?, notas=? WHERE id=?',
      [plazo.estado, plazo.notas || '', plazo.id]
    );
  }
  if (syncPlazosActivo()) {
    const promesa = outlookId
      ? actualizarEventoOutlook(outlookId, plazo)
      : (plazo.caso_id && plazo.titulo && plazo.fecha_limite)
        ? crearEventoParaPlazo(plazo).then(ev => {
            if (ev.success && ev.id) {
              runQuery('UPDATE plazos SET outlook_event_id=? WHERE id=?', [ev.id, plazo.id]);
            }
          })
        : null;
    if (promesa) promesa.catch(() => {});
  }
  return { success: true };
});

ipcMain.handle('deletePlazo', (event, id) => {
  const row = queryOne('SELECT outlook_event_id FROM plazos WHERE id=?', [id]);
  borrarRegistro('plazos', id);
  if (row && row.outlook_event_id && syncPlazosActivo()) {
    borrarEventoOutlook(row.outlook_event_id).catch(() => {});
  }
  return { success: true };
});

// Seguimiento
ipcMain.handle('getSeguimiento', (event, casoId) => {
  return queryAll('SELECT * FROM seguimiento WHERE caso_id=? ORDER BY fecha DESC', [casoId]);
});

ipcMain.handle('addSeguimiento', (event, nota) => {
  return runQuery(
    'INSERT INTO seguimiento (caso_id, nota, autor) VALUES (?, ?, ?)',
    [nota.caso_id, nota.nota, nota.autor]
  );
});

// Estad�sticas
ipcMain.handle('getEstadisticas', () => {
  const totalCasos = queryOne('SELECT COUNT(*) as total FROM casos').total;
  const casosActivos = queryOne("SELECT COUNT(*) as total FROM casos WHERE estado='Activo'").total;
  const totalClientes = queryOne('SELECT COUNT(*) as total FROM clientes').total;
  const plazosPendientes = queryOne("SELECT COUNT(*) as total FROM plazos WHERE estado='Pendiente'").total;
  const plazosVencidos = queryOne("SELECT COUNT(*) as total FROM plazos WHERE estado='Vencido'").total;
  const porTipo = queryAll('SELECT tipo, COUNT(*) as total FROM casos GROUP BY tipo');
  const porEstado = queryAll('SELECT estado, COUNT(*) as total FROM casos GROUP BY estado');
  const notificacionesEnviadas = queryOne("SELECT COUNT(*) as total FROM notificaciones WHERE estado='Enviado'").total;
  const seguimientos = queryOne('SELECT COUNT(*) as total FROM seguimiento').total;
  
  return { totalCasos, casosActivos, totalClientes, plazosPendientes, plazosVencidos, porTipo, porEstado, notificacionesEnviadas, seguimientos };
});

// B�squeda
ipcMain.handle('searchCasos', (event, query) => {
  const q = `%${query}%`;
  return queryAll(`
    SELECT c.*, cl.nombre as cliente_nombre 
    FROM casos c 
    LEFT JOIN clientes cl ON c.cliente_id = cl.id 
    WHERE c.titulo LIKE ? OR c.numero_caso LIKE ? OR cl.nombre LIKE ?
    ORDER BY c.fecha_apertura DESC
  `, [q, q, q]);
});

ipcMain.handle('searchClientes', (event, query) => {
  const q = `%${query}%`;
  return queryAll(`
    SELECT * FROM clientes 
    WHERE nombre LIKE ? OR cedula LIKE ? OR telefono LIKE ?
    ORDER BY nombre
  `, [q, q, q]);
});

// Notificaciones
ipcMain.handle('getNotificaciones', () => {
  return queryAll(`
    SELECT n.*, c.titulo as caso_titulo, cl.nombre as cliente_nombre
    FROM notificaciones n
    LEFT JOIN casos c ON n.caso_id = c.id
    LEFT JOIN clientes cl ON n.cliente_id = cl.id
    WHERE n.tipo <> 'Respuesta de Cliente'
    ORDER BY n.fecha DESC
  `);
});

ipcMain.handle('addNotificacion', (event, notif) => {
  return runQuery(
    'INSERT INTO notificaciones (caso_id, cliente_id, tipo, mensaje, telefono, email, canal, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [notif.caso_id, notif.cliente_id, notif.tipo, notif.mensaje, notif.telefono || null, notif.email || null, notif.canal || null, notif.estado || 'Enviado']
  );
});

ipcMain.handle('deleteNotificacion', (event, id) => {
  borrarRegistro('notificaciones', id);
  return { success: true };
});

// Configuraci�n SMTP (correo)
ipcMain.handle('getSMTPConfig', () => {
  return getSMTPConfig();
});

ipcMain.handle('saveSMTPConfig', (event, cfg) => {
  setConfig('smtp_host', (cfg.host || '').trim());
  setConfig('smtp_port', (cfg.port || '587').trim());
  setConfig('smtp_user', (cfg.user || '').trim());
  setConfig('smtp_pass', (cfg.pass || '').trim());
  setConfig('smtp_from', (cfg.from || '').trim());
  return { success: true };
});

function crearTransportSMTP() {
  const cfg = getSMTPConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { error: 'SMTP no configurado' };
  }
  return {
    transport: nodemailer.createTransport({
      host: cfg.host,
      port: parseInt(cfg.port, 10) || 587,
      secure: parseInt(cfg.port, 10) === 465,
      auth: { user: cfg.user, pass: cfg.pass }
    }),
    cfg
  };
}

async function enviarPorSMTP(email, asunto, mensaje) {
  const creado = crearTransportSMTP();
  if (creado.error) return { success: false, error: creado.error };
  const { transport, cfg } = creado;
  const remitente = cfg.from || cfg.user;
  try {
    await transport.sendMail({
      from: remitente,
      to: email,
      subject: asunto,
      text: mensaje
    });
    transport.close();
    return { success: true };
  } catch (err) {
    transport.close();
    return { success: false, error: err.message };
  }
}

ipcMain.handle('enviarEmail', async (event, email, asunto, mensaje) => {
  const tokenOutlook = await getOutlookAccessToken();
  if (tokenOutlook) {
    const resGraph = await sendMailOutlookDirect(email, asunto, mensaje);
    if (resGraph.success) return { success: true, canal: 'Outlook' };
    const resFallback = await enviarPorSMTP(email, asunto, mensaje);
    if (resFallback.success) return { success: true, canal: 'SMTP' };
    return { success: false, canal: 'Outlook', error: `Outlook: ${resGraph.error || 'error'}` };
  }
  const resSMTP = await enviarPorSMTP(email, asunto, mensaje);
  if (resSMTP.success) return { success: true, canal: 'SMTP' };
  return { success: false, canal: 'SMTP', error: resSMTP.error || 'Error al enviar el correo' };
});

ipcMain.handle('testSMTP', async () => {
  const creado = crearTransportSMTP();
  if (creado.error) return { success: false, error: creado.error };
  const { transport, cfg } = creado;
  try {
    await transport.verify();
    transport.close();
    return { success: true, user: cfg.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==================== MICROSOFT OUTLOOK (GRAPH API) ====================
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const OUTLOOK_SCOPES = 'offline_access openid profile User.Read Calendars.ReadWrite Mail.Read Mail.Send';

function getOutlookConfig() {
  return {
    client_id: getConfig('outlook_client_id') || '084a3e9f-a9f4-43f7-89f9-d229cf97853e',
    tenant: getConfig('outlook_tenant') || 'consumers'
  };
}

function getOutlookTokens() {
  return {
    access_token: getConfig('outlook_access_token') || '',
    refresh_token: getConfig('outlook_refresh_token') || '',
    expires_at: parseInt(getConfig('outlook_token_expires') || '0', 10),
    email: getConfig('outlook_email') || ''
  };
}

function borrarTokensOutlook() {
  setConfig('outlook_access_token', '');
  setConfig('outlook_refresh_token', '');
  setConfig('outlook_token_expires', '0');
  setConfig('outlook_email', '');
}

async function refreshOutlookToken() {
  const cfg = getOutlookConfig();
  const tokens = getOutlookTokens();
  if (!cfg.client_id || !tokens.refresh_token) return null;
  const url = `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.client_id,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
    scope: OUTLOOK_SCOPES
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    setConfig('outlook_access_token', data.access_token);
    if (data.refresh_token) setConfig('outlook_refresh_token', data.refresh_token);
    setConfig('outlook_token_expires', String(Date.now() + (data.expires_in || 3600) * 1000));
    return data.access_token;
  } catch (err) {
    return null;
  }
}

ipcMain.handle('conectarOutlook', async () => {
  const cfg = getOutlookConfig();
  try {
    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/devicecode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.client_id, scope: OUTLOOK_SCOPES }).toString()
    });
    const data = await res.json();
    if (!res.ok || !data.device_code) return { success: false, error: data.error_description || data.error || 'Error al obtener código' };
    return { success: true, user_code: data.user_code, verification_uri: data.verification_uri || 'https://microsoft.com/devicelogin', device_code: data.device_code, interval: data.interval || 5, message: data.message };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('verificarOutlook', async (e, deviceCode, interval) => {
  const cfg = getOutlookConfig();
  const start = Date.now();
  while (Date.now() - start < 900000) {
    try {
      const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenant)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: cfg.client_id, device_code: deviceCode }).toString()
      });
      const data = await res.json();
      if (data.access_token) {
        setConfig('outlook_access_token', data.access_token);
        if (data.refresh_token) setConfig('outlook_refresh_token', data.refresh_token);
        setConfig('outlook_token_expires', String(Date.now() + (data.expires_in || 3600) * 1000));
        try {
          const me = await fetch(`${GRAPH_BASE}/me`, { headers: { 'Authorization': 'Bearer ' + data.access_token } }).then(r => r.json());
          const email = me.mailPrincipalName || me.userPrincipalName || '';
          if (email) setConfig('outlook_email', email);
        } catch (_) {}
        return { success: true };
      }
      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        await new Promise(r => setTimeout(r, (interval || 5) * 1000));
        continue;
      }
      return { success: false, error: data.error_description || data.error || 'Error' };
    } catch (err) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return { success: false, error: 'Tiempo de espera agotado' };
});

ipcMain.handle('desconectarOutlook', () => { borrarTokensOutlook(); return { success: true }; });

ipcMain.handle('outlookStatus', () => { const t = getOutlookTokens(); return { connected: !!getConfig('outlook_refresh_token'), email: t.email }; });

async function getOutlookAccessToken() {
  const tokens = getOutlookTokens();
  if (tokens.access_token && Date.now() < tokens.expires_at) return tokens.access_token;
  if (!tokens.refresh_token) return null;
  return refreshOutlookToken();
}

async function graphRequest(ruta, opciones = {}) {
  const token = await getOutlookAccessToken();
  if (!token) return { error: 'Outlook no conectado' };
  const res = await fetch(GRAPH_BASE + ruta, {
    ...opciones,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    }
  });
  if (!res.ok) {
    let txt = '';
    try { txt = (await res.text()).substring(0, 500); } catch (e) {}
    return { error: `Graph API (${res.status}): ${txt}` };
  }
  if (res.status === 204) return { success: true };
  const txt = await res.text();
  if (!txt) return { success: true };
  try {
    return JSON.parse(txt);
  } catch (e) {
    return { success: true };
  }
}

async function sendMailOutlookDirect(para, asunto, mensaje) {
  const payload = {
    message: {
      subject: asunto,
      body: { contentType: 'text', content: mensaje },
      toRecipients: [{ emailAddress: { address: para } }]
    },
    saveToSentItems: true
  };
  const data = await graphRequest('/me/sendMail', { method: 'POST', body: JSON.stringify(payload) });
  if (data.error) return { success: false, error: data.error };
  return { success: true };
}

// ==================== OUTLOOK (env�o autom�tico) ====================
let outlookEventsCache = { key: '', ts: 0, data: null };
function invalidarCacheOutlook() { outlookEventsCache.ts = 0; }

async function createOutlookEventDirect(ev) {
  const payload = {
    subject: ev.subject,
    start: ev.start,
    end: ev.end,
    body: { contentType: 'text', content: ev.content || '' },
    isReminderOn: ev.isReminderOn !== undefined ? ev.isReminderOn : true,
    reminderMinutesBeforeStart: ev.reminderMinutesBeforeStart || 0
  };
  if (ev.location) payload.location = { displayName: ev.location };
  const data = await graphRequest('/me/events', { method: 'POST', body: JSON.stringify(payload) });
  if (data.error) return { success: false, error: data.error };
  invalidarCacheOutlook();
  return { success: true, id: data.id, webLink: data.webLink };
}

async function updateOutlookEventDirect(id, cambios) {
  const data = await graphRequest('/me/events/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(cambios) });
  if (data.error) return { success: false, error: data.error };
  invalidarCacheOutlook();
  return { success: true, id: data.id };
}

async function deleteOutlookEventDirect(id) {
  const data = await graphRequest('/me/events/' + encodeURIComponent(id), { method: 'DELETE' });
  if (data.error) return { success: false, error: data.error };
  invalidarCacheOutlook();
  return { success: true };
}

ipcMain.handle('getOutlookEvents', async (event, startISO, endISO) => {
  const inicio = startISO || new Date().toISOString();
  let fin = endISO;
  if (!fin) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    fin = d.toISOString();
  }
  const cacheKey = inicio + '|' + fin;
  if (outlookEventsCache.data && outlookEventsCache.key === cacheKey && (Date.now() - outlookEventsCache.ts) < 60000) {
    return outlookEventsCache.data;
  }
  const ruta = `/me/calendarView?startDateTime=${encodeURIComponent(inicio)}&endDateTime=${encodeURIComponent(fin)}&$orderby=start/dateTime&$select=id,subject,start,end,isAllDay,location,bodyPreview,webLink`;
  const data = await graphRequest(ruta);
  if (data.error) return { success: false, error: data.error };
  const resultado = {
    success: true,
    eventos: (data.value || []).map(e => ({
      id: e.id,
      subject: e.subject || '(Sin asunto)',
      start: e.start ? e.start.dateTime : '',
      end: e.end ? e.end.dateTime : '',
      location: e.location ? (e.location.displayName || '') : '',
      bodyPreview: e.bodyPreview || '',
      webLink: e.webLink || '',
      isAllDay: !!e.isAllDay
    }))
  };
  outlookEventsCache = { key: cacheKey, ts: Date.now(), data: resultado };
  return resultado;
});

ipcMain.handle('createOutlookEvent', (event, ev) => {
  return createOutlookEventDirect(ev);
});

ipcMain.handle('updateOutlookEvent', (event, id, ev) => {
  return updateOutlookEventDirect(id, ev);
});

ipcMain.handle('deleteOutlookEvent', (event, id) => {
  return deleteOutlookEventDirect(id);
});

// ==================== CUENTAS POR COBRAR ====================
ipcMain.handle('getFacturas', () => {
  return queryAll(`
    SELECT f.*, c.titulo as caso_titulo, cl.nombre as cliente_nombre,
      (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE factura_id = f.id) as pagado
    FROM facturas f
    LEFT JOIN casos c ON f.caso_id = c.id
    LEFT JOIN clientes cl ON f.cliente_id = cl.id
    ORDER BY f.fecha_emision DESC
  `);
});

ipcMain.handle('getFacturasPendientes', () => {
  return queryAll(`
    SELECT f.*, cl.nombre as cliente_nombre, c.titulo as caso_titulo,
      (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE factura_id = f.id) as pagado
    FROM facturas f
    LEFT JOIN casos c ON f.caso_id = c.id
    LEFT JOIN clientes cl ON f.cliente_id = cl.id
    WHERE f.estado IN ('Pendiente','Parcial')
    ORDER BY f.fecha_vencimiento IS NULL, f.fecha_vencimiento ASC
  `);
});

ipcMain.handle('addFactura', (event, factura) => {
  const nextNum = (queryOne('SELECT COALESCE(MAX(numero),0)+1 as n FROM facturas').n);
  return runQuery(
    'INSERT INTO facturas (numero, caso_id, cliente_id, concepto, monto, estado, fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nextNum, factura.caso_id, factura.cliente_id, factura.concepto, factura.monto || 0, factura.estado || 'Pendiente', factura.fecha_vencimiento || null]
  );
});

ipcMain.handle('updateFactura', (event, factura) => {
  runQuery(
    'UPDATE facturas SET caso_id=?, cliente_id=?, concepto=?, monto=?, estado=?, fecha_vencimiento=? WHERE id=?',
    [factura.caso_id || null, factura.cliente_id || null, factura.concepto, factura.monto, factura.estado, factura.fecha_vencimiento || null, factura.id]
  );
  return { success: true };
});

ipcMain.handle('deleteFactura', (event, id) => {
  queryAll('SELECT id FROM pagos WHERE factura_id=?', [id]).forEach(p => borrarRegistro('pagos', p.id));
  borrarRegistro('facturas', id);
  return { success: true };
});

ipcMain.handle('getPagos', (event, facturaId) => {
  return queryAll('SELECT p.*, f.numero as factura_num FROM pagos p JOIN facturas f ON p.factura_id = f.id WHERE p.factura_id=? ORDER BY p.fecha DESC', [facturaId]);
});

ipcMain.handle('getPagosTodos', () => {
  return queryAll('SELECT p.*, f.numero as factura_num, cl.nombre as cliente_nombre FROM pagos p JOIN facturas f ON p.factura_id = f.id LEFT JOIN clientes cl ON f.cliente_id = cl.id ORDER BY p.fecha DESC');
});

ipcMain.handle('addPago', (event, pago) => {
  const result = runQuery(
    'INSERT INTO pagos (factura_id, monto, metodo, referencia) VALUES (?, ?, ?, ?)',
    [pago.factura_id, pago.monto, pago.metodo || 'Efectivo', pago.referencia || null]
  );
  const total = queryOne('SELECT monto as total FROM facturas WHERE id=?', [pago.factura_id]).total;
  const pagado = queryOne('SELECT COALESCE(SUM(monto),0) as p FROM pagos WHERE factura_id=?', [pago.factura_id]).p;
  let estado = 'Pendiente';
  if (pagado >= total) estado = 'Pagada';
  else if (pagado > 0) estado = 'Parcial';
  runQuery('UPDATE facturas SET estado=? WHERE id=?', [estado, pago.factura_id]);
  return result;
});

ipcMain.handle('deletePago', (event, id) => {
  const pago = queryOne('SELECT factura_id FROM pagos WHERE id=?', [id]);
  borrarRegistro('pagos', id);
  if (pago) {
    const total = queryOne('SELECT monto as total FROM facturas WHERE id=?', [pago.factura_id]).total;
    const pagado = queryOne('SELECT COALESCE(SUM(monto),0) as p FROM pagos WHERE factura_id=?', [pago.factura_id]).p;
    let estado = 'Pendiente';
    if (pagado >= total) estado = 'Pagada';
    else if (pagado > 0) estado = 'Parcial';
    runQuery('UPDATE facturas SET estado=? WHERE id=?', [estado, pago.factura_id]);
  }
  return { success: true };
});

ipcMain.handle('getCuentasPorCobrar', () => {
  return queryAll(`
    SELECT f.*, cl.nombre as cliente_nombre, c.titulo as caso_titulo,
      COALESCE((SELECT SUM(monto) FROM pagos WHERE factura_id = f.id),0) as pagado,
      (f.monto - COALESCE((SELECT SUM(monto) FROM pagos WHERE factura_id = f.id),0)) as saldo,
      CASE WHEN f.fecha_vencimiento < date('now') AND f.estado IN ('Pendiente','Parcial') THEN 1 ELSE 0 END as vencida
    FROM facturas f
    LEFT JOIN casos c ON f.caso_id = c.id
    LEFT JOIN clientes cl ON f.cliente_id = cl.id
    WHERE f.estado IN ('Pendiente','Parcial')
    ORDER BY f.fecha_vencimiento IS NULL, f.fecha_vencimiento ASC
  `);
});

ipcMain.handle('enviarRecordatorioCobro', async (event, facturaId) => {
  const f = queryOne(`
    SELECT f.*, cl.nombre as cliente_nombre, cl.email as cliente_email, c.titulo as caso_titulo,
      (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE factura_id = f.id) as pagado
    FROM facturas f
    LEFT JOIN clientes cl ON f.cliente_id = cl.id
    LEFT JOIN casos c ON f.caso_id = c.id
    WHERE f.id=?
  `, [facturaId]);
  if (!f) return { success: false, error: 'Factura no encontrada' };
  if (!f.cliente_email) return { success: false, error: 'El cliente de esta factura no tiene correo registrado en su ficha.' };
  const saldo = (f.monto || 0) - (f.pagado || 0);
  const fmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const venc = f.fecha_vencimiento
    ? new Date(f.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'sin fecha de vencimiento';
  const asunto = f.caso_titulo ? `LEX - Recordatorio de Pago - ${f.caso_titulo}` : `LEX - Recordatorio de Pago - Factura N� ${f.numero}`;
  const mensaje = [
    `Estimado/a ${f.cliente_nombre},`,
    '',
    `Le recordamos que la factura N� ${f.numero} se encuentra pendiente de pago:`,
    `- Concepto: ${f.concepto || '-'}`,
    `- Monto total: $${fmt.format(f.monto || 0)}`,
    `- Saldo pendiente: $${fmt.format(saldo)}`,
    `- Vencimiento: ${venc}`,
    '',
    'Para coordinar el pago o resolver cualquier duda, contacte a su abogado a la brevedad.',
    'Atentamente, LexConsilium Consultores.'
  ].join('\n');

  const tokenOutlook = await getOutlookAccessToken();
  let res;
  if (tokenOutlook) {
    res = await sendMailOutlookDirect(f.cliente_email, asunto, mensaje);
    if (res.success) res = { success: true, canal: 'Outlook' };
    else {
      const fb = await enviarPorSMTP(f.cliente_email, asunto, mensaje);
      res = fb.success ? { success: true, canal: 'SMTP' } : { success: false, canal: 'Outlook', error: `Outlook: ${res.error || 'error'}` };
    }
  } else {
    res = await enviarPorSMTP(f.cliente_email, asunto, mensaje);
    if (!res.success) res = { success: false, canal: 'SMTP', error: res.error || 'Error al enviar el correo' };
  }
  return { ...res, asunto, mensaje, email: f.cliente_email, caso_id: f.caso_id, cliente_id: f.cliente_id };
});

// ==================== GENERADOR DE DOCUMENTOS LEGALES ====================
function generarDocumentoLegal(tipo, dato) {
  const hoy = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const parte = dato.cliente_nombre || dato.nombre || '[Nombre del Cliente]';
  const cedula = dato.cliente_cedula || '[C�dula]';
  const domicilio = dato.cliente_direccion || '[Domicilio]';
  const contraparte = dato.contraparte || '[Nombre de la Contraparte]';
  const objeto = dato.objeto || '[Descripci�n del Objeto]';
  const tribunal = dato.tribunal || '[Tribunal]';
  const caso = dato.caso_titulo || '[N� de Expediente]';

  const plantillas = {
    'demanda': `REP�BLICA BOLIVARIANA DE VENEZUELA
EN SU NOMBRE
JUZGADO ${tribunal.toUpperCase()}

EXPEDIENTE N�: ${caso}

Yo, ${parte}, venezolano(a), mayor de edad, titular de la c�dula de identidad N� ${cedula}, domiciliado(a) en ${domicilio}, asistido(a) por abogado(a) en ejercicio, por medio del presente escrito ocurro ante su competente autoridad para interponer formal DEMANDA contra ${contraparte}, por ${objeto}, de conformidad con lo establecido en la ley.

CAP�TULO PRIMERO
DE LOS HECHOS

"Descripci�n detallada de los hechos que motivan la presente demanda..."

CAP�TULO SEGUNDO
DEL DERECHO

"Fundamentos legales que sustentan la pretensi�n..."

CAP�TULO TERCERO
DEL PETITORIO

En virtud de lo antes expuesto, solicito a este Tribunal admita la presente demanda y la sustancie conforme a derecho.

Es justicia que solicito en la ciudad de ${domicilio.split(',')[0] || '[Ciudad]'}, a los ${hoy}.

${parte}`,

    'poder': `PODER GENERAL DE REPRESENTACI�N

Yo, ${parte}, venezolano(a), mayor de edad, titular de la c�dula de identidad N� ${cedula}, domiciliado(a) en ${domicilio}, por medio del presente documento declaro:

Que confiero PODER GENERAL DE REPRESENTACI�N LITIGIOSA, amplio y bastante cuanto en derecho se requiere, a favor del (de la) abogado(a) ${dato.abogado || '[Nombre del Abogado]'}, inscrito(a) en el INPREABOGADO bajo el N� ${dato.ipsa || '[N� IPSA]'}, para que en mi nombre y representaci�n ejerza toda clase de actuaciones judiciales y extrajudiciales ante los tribunales de la Rep�blica Bolivariana de Venezuela.

Particularmente queda facultado(a) para: intentar y contestar demandas, desistir, transigir, convenir, solicitar medidas preventivas, promover y evacuar pruebas, interponer recursos y, en general, ejercer todas las facultades que la ley confiere a los apoderados.

Se otorga el presente poder en la ciudad de ${domicilio.split(',')[0] || '[Ciudad]'}, a los ${hoy}.

${parte}`,

    'contrato': `CONTRATO DE SERVICIOS PROFESIONALES

Entre ${parte}, titular de la c�dula de identidad N� ${cedula}, en lo sucesivo "EL CLIENTE", y el (la) abogado(a) ${dato.abogado || '[Abogado]'}, inscrito(a) en el INPREABOGADO bajo el N� ${dato.ipsa || '[N� IPSA]'}, en lo sucesivo "EL PROFESIONAL", se celebra el presente contrato de conformidad con las siguientes cl�usulas:

PRIMERA: EL CLIENTE encomienda al PROFESIONAL el patrocinio jur�dico en el asunto relativo a: ${objeto}.

SEGUNDA: EL PROFESIONAL se obliga a prestar sus servicios profesionales con diligencia, lealtad y confidencialidad, informando peri�dicamente al CLIENTE sobre el estado de su asunto.

TERCERA: Como contraprestaci�n, el CLIENTE pagar� al PROFESIONAL la cantidad de ${dato.honorarios || '[Monto de Honorarios]'} por concepto de honorarios profesionales.

CUARTA: Este poder se otorga en la ciudad de ${domicilio.split(',')[0] || '[Ciudad]'}, a los ${hoy}.

${parte}\n\n${dato.abogado || '[Abogado]'}`,

    'inspeccion': `SOLICITUD DE INSPECCI�N JUDICIAL

REP�BLICA BOLIVARIANA DE VENEZUELA
EN SU NOMBRE
JUZGADO ${tribunal.toUpperCase()}

EXPEDIENTE N�: ${caso}

Yo, ${parte}, venezolano(a), mayor de edad, titular de la c�dula de identidad N� ${cedula}, asistido(a) por abogado(a), de este domicilio, ante su competente autoridad ocurro y expongo:

Que de conformidad con el art�culo 472 y siguientes del C�digo de Procedimiento Civil, solicito se sirva practicar INSPECCI�N JUDICIAL en: ${objeto}.

Dicha inspecci�n es necesaria para que conste en autos el estado, caracter�sticas y circunstancias del lugar objeto de la inspecci�n, a los fines de hacer valer mis derechos en el presente juicio.

Pido a este Tribunal decrete la pr�ctica de la misma y designe el d�a y la hora para su evacuaci�n.

Es justicia que solicito en la ciudad de ${domicilio.split(',')[0] || '[Ciudad]'}, a los ${hoy}.

${parte}`,

    'testimonial': `SOLICITUD DE EXHIBICI�N / PRUEBA TESTIMONIAL

REP�BLICA BOLIVARIANA DE VENEZUELA
EN SU NOMBRE
JUZGADO ${tribunal.toUpperCase()}

EXPEDIENTE N�: ${caso}

Yo, ${parte}, parte actora en el presente juicio, asistido(a) por abogado(a) de este domicilio, ante su competente autoridad ocurro y expongo:

De conformidad con lo establecido en el C�digo de Procedimiento Civil, solicito la evacuaci�n de las siguientes pruebas relativas al asunto de ${objeto}:

1. PRUEBA TESTIMONIAL: Se solicita la declaraci�n de los testigos sobre los hechos controvertidos.
2. EXHIBICI�N DE DOCUMENTOS: Se solicita a la contraparte la exhibici�n de los documentos relacionados con el presente asunto.

Pido a este Tribunal admita y sustancie las pruebas solicitadas conforme a derecho.

Es justicia que solicito en la ciudad de ${domicilio.split(',')[0] || '[Ciudad]'}, a los ${hoy}.

${parte}`
  };

  return plantillas[tipo] || plantillas.demanda;
}

ipcMain.handle('generarDocumento', (event, tipo, dato) => {
  const contenido = generarDocumentoLegal(tipo, dato);
  return runQuery(
    'INSERT INTO documentos_generados (titulo, tipo, caso_id, contenido) VALUES (?, ?, ?, ?)',
    [`${tipo.charAt(0).toUpperCase() + tipo.slice(1)} - ${dato.caso_titulo || ''}`, tipo, dato.caso_id || null, contenido]
  );
});

ipcMain.handle('getDocumentosGenerados', () => {
  return queryAll(`
    SELECT dg.*, c.titulo as caso_titulo
    FROM documentos_generados dg
    LEFT JOIN casos c ON dg.caso_id = c.id
    ORDER BY dg.fecha_creacion DESC
  `);
});

ipcMain.handle('deleteDocumentoGenerado', (event, id) => {
  borrarRegistro('documentos_generados', id);
  return { success: true };
});

ipcMain.handle('guardarDocumentoGenerado', (event, doc) => {
  runQuery(
    'UPDATE documentos_generados SET contenido=? WHERE id=?',
    [doc.contenido, doc.id]
  );
  return { success: true };
});

// ==================== CALENDARIO DE PLAZOS LEGALES ====================
const plazosLegales = {
  'civil': [
    { nombre: 'Contestaci�n de demanda', dias: 20, descripcion: 'Plazo para contestar la demanda en procedimiento ordinario (art. 359 CPC)' },
    { nombre: 'Apelaci�n de sentencia definitiva', dias: 5, descripcion: 'Plazo para ejercer recurso de apelaci�n (art. 298 CPC)' },
    { nombre: 'Apelaci�n de sentencia interlocutoria', dias: 5, descripcion: 'Plazo para apelar sentencias interlocutorias (art. 297 CPC)' },
    { nombre: 'Recurso de casaci�n', dias: 10, descripcion: 'Plazo para interponer recurso de casaci�n (art. 313 CPC)' },
    { nombre: 'Solicitud de aclaratoria', dias: 3, descripcion: 'Plazo para solicitar aclaratoria de sentencia (art. 252 CPC)' },
    { nombre: 'Reconvenci�n', dias: 20, descripcion: 'T�rmino para proponer reconvenci�n (art. 366 CPC)' },
    { nombre: 'Promoci�n de pruebas', dias: 15, descripcion: 'Plazo para promover pruebas en juicio ordinario (art. 396 CPC)' }
  ],
  'penal': [
    { nombre: 'Presentaci�n de imputado', dias: 0, descripcion: 'Audiencia de presentaci�n dentro de las 48 horas siguientes a la aprehensi�n (art. 236 COPP)' },
    { nombre: 'Audiencia preliminar', dias: 0, descripcion: 'Se celebrar� dentro de los 45 d�as siguientes a la presentaci�n (COPP)' },
    { nombre: 'Recurso de casaci�n', dias: 15, descripcion: 'Plazo para recurrir en casaci�n la sentencia (COPP)' },
    { nombre: 'Apelaci�n de sentencia', dias: 10, descripcion: 'Plazo para interponer apelaci�n contra sentencia definitiva (COPP)' }
  ],
  'laboral': [
    { nombre: 'Contestaci�n de demanda', dias: 5, descripcion: 'Plazo para contestar la demanda laboral (LOPTRA)' },
    { nombre: 'Audiencia preliminar', dias: 0, descripcion: 'Se fijar� dentro de los 10 d�as h�biles siguientes (LOPTRA)' },
    { nombre: 'Apelaci�n', dias: 5, descripcion: 'Plazo para apelar sentencia definitiva laboral (LOPTRA)' },
    { nombre: 'Casaci�n laboral', dias: 10, descripcion: 'Plazo para interponer recurso de casaci�n laboral (LOPTRA)' }
  ],
  'administrativo': [
    { nombre: 'Recurso de nulidad', dias: 180, descripcion: 'Plazo para interponer recurso contencioso administrativo de nulidad (LOPA)' },
    { nombre: 'Recurso de reconsideraci�n', dias: 25, descripcion: 'Plazo para recurso de reconsideraci�n (art. 94 LOPA)' },
    { nombre: 'Recurso jer�rquico', dias: 25, descripcion: 'Plazo para recurso jer�rquico (art. 94 LOPA)' },
    { nombre: 'Recurso de revisi�n', dias: 180, descripcion: 'Plazo para recurso de revisi�n (LOPA)' }
  ],
  'mercantil': [
    { nombre: 'Contestaci�n de demanda', dias: 20, descripcion: 'Plazo para contestar en juicio ordinario mercantil' },
    { nombre: 'Apelaci�n', dias: 5, descripcion: 'Plazo para apelar sentencias mercantiles' },
    { nombre: 'Casaci�n', dias: 10, descripcion: 'Plazo para recurso de casaci�n' }
  ]
};

ipcMain.handle('getPlazosLegales', (event, materia) => {
  if (materia && plazosLegales[materia]) return plazosLegales[materia];
  return plazosLegales;
});

ipcMain.handle('generarPlazoDesdeLegal', async (event, plazoInfo) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + (plazoInfo.dias || 0));
  return insertarPlazoConSync({
    caso_id: plazoInfo.caso_id,
    titulo: plazoInfo.titulo,
    fecha_limite: fecha.toISOString().split('T')[0],
    hora: plazoInfo.hora || '09:00',
    notas: plazoInfo.descripcion || ''
  });
});

// ==================== CHAT GUARDADO (LEXAI) ====================
ipcMain.handle('guardarConversacion', (event, conv) => {
  const titulo = conv.titulo || ('Conversaci�n ' + new Date().toLocaleDateString('es-ES'));
  const usuario = conv.usuario || 'admin';
  const contenido = JSON.stringify(conv.mensajes || []);
  if (conv.id) {
    runQuery(
      'UPDATE conversaciones_chat SET titulo=?, contenido=?, fecha_guardado=CURRENT_TIMESTAMP WHERE id=?',
      [titulo, contenido, conv.id]
    );
    return { success: true, id: conv.id };
  }
  const res = runQuery(
    'INSERT INTO conversaciones_chat (titulo, usuario, contenido) VALUES (?, ?, ?)',
    [titulo, usuario, contenido]
  );
  return { success: true, id: res.lastId };
});

ipcMain.handle('getConversaciones', () => {
  return queryAll('SELECT id, titulo, usuario, fecha_guardado FROM conversaciones_chat ORDER BY fecha_guardado DESC');
});

ipcMain.handle('getConversacion', (event, id) => {
  const row = queryOne('SELECT * FROM conversaciones_chat WHERE id=?', [id]);
  if (!row) return null;
  let mensajes = [];
  try { mensajes = JSON.parse(row.contenido || '[]'); } catch (e) { mensajes = []; }
  return { ...row, mensajes };
});

ipcMain.handle('eliminarConversacion', (event, id) => {
  borrarRegistro('conversaciones_chat', id);
  return { success: true };
});

// ==================== AUTENTICACI�N Y USUARIOS ====================
ipcMain.handle('login', (event, usuario, password) => {
  const user = queryOne(
    'SELECT * FROM usuarios WHERE usuario=? AND password=? AND activo=1',
    [usuario, password]
  );
  if (user) {
    currentUser = user;
    return { success: true, user: { id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol } };
  }
  return { success: false, error: 'Usuario o contrase�a incorrectos' };
});

ipcMain.handle('logout', () => {
  currentUser = null;
  return { success: true };
});

ipcMain.handle('getCurrentUser', () => {
  if (currentUser) {
    return { id: currentUser.id, usuario: currentUser.usuario, nombre: currentUser.nombre, rol: currentUser.rol };
  }
  return null;
});

ipcMain.handle('getUsuarios', () => {
  return queryAll('SELECT id, usuario, nombre, rol, activo, fecha_creacion FROM usuarios ORDER BY nombre');
});

ipcMain.handle('addUsuario', (event, user) => {
  const existing = queryOne('SELECT id FROM usuarios WHERE usuario=?', [user.usuario]);
  if (existing) return { success: false, error: 'El nombre de usuario ya existe' };
  return runQuery(
    'INSERT INTO usuarios (usuario, nombre, password, rol, activo) VALUES (?, ?, ?, ?, ?)',
    [user.usuario, user.nombre, user.password, user.rol || 'asistente', user.activo !== undefined ? user.activo : 1]
  );
});

ipcMain.handle('updateUsuario', (event, user) => {
  if (user.password) {
    runQuery(
      'UPDATE usuarios SET nombre=?, rol=?, activo=?, password=? WHERE id=?',
      [user.nombre, user.rol, user.activo, user.password, user.id]
    );
  } else {
    runQuery(
      'UPDATE usuarios SET nombre=?, rol=?, activo=? WHERE id=?',
      [user.nombre, user.rol, user.activo, user.id]
    );
  }
  if (currentUser && currentUser.id === user.id) {
    currentUser.nombre = user.nombre;
    currentUser.rol = user.rol;
  }
  return { success: true };
});

ipcMain.handle('deleteUsuario', (event, id) => {
  if (currentUser && currentUser.id === id) return { success: false, error: 'No puedes eliminar tu propio usuario' };
  borrarRegistro('usuarios', id);
  return { success: true };
});

// ==================== INTELIGENCIA ARTIFICIAL (GEMINI) ====================
function getGeminiKey() {
  return getConfig('ia_api_key') || '';
}

function getIAModel() {
  return getConfig('ia_modelo') || 'gemini-3.6-flash';
}

ipcMain.handle('getIAConfig', () => {
  return {
    key: getGeminiKey(),
    model: getIAModel(),
    configurada: !!getGeminiKey()
  };
});

ipcMain.handle('saveIAConfig', (event, cfg) => {
  setConfig('ia_api_key', (cfg.key || '').trim());
  setConfig('ia_modelo', (cfg.model || 'gemini-3.6-flash').trim());
  return { success: true };
});

ipcMain.handle('chatIA', async (event, mensaje, historial) => {
  const key = getGeminiKey();
  if (!key) {
    return { success: false, error: 'IA no configurada. Ingresa tu API key en Configuraci�n.' };
  }

  const systemPrompt = {
    role: 'system',
    parts: [{ text: 'Eres LexAI, un asistente jur�dico experto en derecho venezolano e internacional. Proporciona asesor�a legal general, orientaci�n sobre plazos procesales, redacci�n de escritos b�sicos y explicaci�n de conceptos legales. Responde siempre en espa�ol, de forma clara y profesional. IMPORTANTE: Recuerda que no sustituyes a un abogado real y que los casos pueden requerir asesor�a profesional personalizada. Si la consulta requiere un abogado especializado, recomienda contactar al estudio LexConsilium Consultores. Mant�n las respuestas concisas y �tiles (m�ximo ~300 palabras por respuesta).' }]
  };

  let contents = [];
  if (historial && Array.isArray(historial)) {
    contents = historial.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.text || '') }]
    }));
  }
  contents.push({ role: 'user', parts: [{ text: String(mensaje) }] });

  const body = {
    systemInstruction: systemPrompt,
    contents: contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
  };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${getIAModel()}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = (data.error && data.error.message) ? data.error.message : `Error HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    const texto = data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content.parts.map(p => (p.text || '')).join('')
      : '(Sin respuesta)';

    return { success: true, respuesta: texto };
  } catch (err) {
    return { success: false, error: err.message || 'Error al conectar con Gemini' };
  }
});

// ==================== AUTO-ACTUALIZACIONES ====================
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  const token = process.env.GH_TOKEN || getConfig('github_token');
  if (token) process.env.GH_TOKEN = token;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let updaterLastProgress = null;
  let updaterStallTimer = null;
  let updaterStallNotified = false;
  let updateAvailableTime = 0;
  let updaterRestartCanceled = false;
  let updaterRestartTimer = null;

  const stopStallWatch = () => {
    if (updaterStallTimer) clearInterval(updaterStallTimer);
    updaterStallTimer = null;
  };

  const checkUpdaterStalled = () => {
    if (!mainWindow || updaterStallNotified) return;
    if (autoUpdater.autoDownload === false) return;
    const now = Date.now();
    const stalled = updaterLastProgress
      ? (now - updaterLastProgress.lastChange) > 30000
      : (now - updateAvailableTime) > 20000;
    if (stalled) {
      updaterStallNotified = true;
      stopStallWatch();
      mainWindow.webContents.send('update-stalled');
    }
  };

  autoUpdater.on('update-available', (info) => {
    updateAvailableTime = Date.now();
    updaterLastProgress = null;
    updaterStallNotified = false;
    updaterRestartCanceled = false;
    stopStallWatch();
    updaterStallTimer = setInterval(checkUpdaterStalled, 10000);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Nueva versi�n disponible',
        body: `LEX ${info.version} est� disponible. Se descargar� en segundo plano.`
      }).show();
    }
    if (mainWindow) mainWindow.webContents.send('update-available', info.version);
  });

  autoUpdater.on('download-progress', (p) => {
    const now = Date.now();
    if (!updaterLastProgress || p.transferred > updaterLastProgress.transferred) {
      updaterLastProgress = { transferred: p.transferred || 0, total: p.total || 0, lastChange: now };
      updaterStallNotified = false;
    }
    if (mainWindow) mainWindow.webContents.send('update-progress', {
      percent: Math.round(p.percent || 0),
      transferred: p.transferred || 0,
      total: p.total || 0
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    stopStallWatch();
    updaterRestartCanceled = false;
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info.version);
    // Instalaci�n autom�tica: LEX se reinicia solo en 15 segundos a menos que el usuario lo cancele.
    if (updaterRestartTimer) clearTimeout(updaterRestartTimer);
    updaterRestartTimer = setTimeout(() => {
      updaterRestartTimer = null;
      if (!updaterRestartCanceled && mainWindow && !mainWindow.isDestroyed()) {
        autoUpdater.quitAndInstall(true, true); app.exit(0);
      }
    }, 15000);
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-not-available');
  });

  autoUpdater.on('error', (err) => {
    stopStallWatch();
    if (mainWindow) mainWindow.webContents.send('update-error', String((err && err.message) || err));
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 12000);
}

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();
  setupAutoUpdater();
  // Conexi�n Supabase en 2� plano (no bloquea el arranque); si conecta, sync cada 5 min
  supaAdapter.initSupabase().then(ok => {
    if (ok) {
      startBackgroundSync();
      syncNow().catch(() => {});
    }
  }).catch(() => {});
});

app.on('window-all-closed', async () => {
  while (dbWriting) {
    await new Promise(r => setTimeout(r, 20));
  }
  saveDbNowSync();
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('restartApp', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('installNow', () => {
  if (!app.isPackaged) return { success: false, error: 'No empaquetada.' };
  updaterRestartCanceled = false;
  if (updaterRestartTimer) {
    clearTimeout(updaterRestartTimer);
    updaterRestartTimer = null;
  }
  autoUpdater.quitAndInstall(true, true); app.exit(0);
  return { success: true };
});

ipcMain.handle('cancelAutoRestart', () => {
  updaterRestartCanceled = true;
  if (updaterRestartTimer) {
    clearTimeout(updaterRestartTimer);
    updaterRestartTimer = null;
  }
  return { success: true };
});

ipcMain.handle('retryUpdateCheck', () => {
  if (!app.isPackaged) return { success: false, error: 'No empaquetada.' };
  autoUpdater.checkForUpdates().catch(() => {});
  return { success: true };
});

ipcMain.handle('syncNow', async () => {
  return syncNow();
});
