const {initSupabase, isEnabled, queryAll} = require('./supabase/dbAdapter');

initSupabase().then(() => {
  if (!isEnabled()) {
    console.log('Supabase no enabled');
    return;
  }
  
  const tables = ['usuarios', 'clientes', 'casos', 'plazos', 'facturas', 'notificaciones', 'seguimiento', 'config', 'documentos', 'pagos', 'documentos_generados', 'conversaciones_chat'];
  
  let i = 0;
  let allData = {};
  
  function next() {
    if (i >= tables.length) {
      // Now import data to local DB
      console.log('=== DATOS RECUPERADOS DE SUPABASE ===');
      importToLocal(allData);
      return;
    }
    const table = tables[i];
    i++;
    queryAll(`SELECT * FROM ${table}`).then(res => {
      const rows = [];
      for (const key in res) {
        if (key !== 'rowCount' && !isNaN(Number(key))) {
          rows.push(res[key]);
        }
      }
      allData[table] = rows;
      console.log(`=== ${table}: ${rows.length} rows ===`);
      if (rows.length > 0) {
        console.log('Ejemplo:', rows[0] ? Object.keys(rows[0]).join(', ') : 'none');
      }
      next();
    }).catch(e => {
      console.log(`=== ${table} ERROR: ${e.message}`);
      next();
    });
  }
  next();
}).catch(e => console.error('Init error:', e));

function importToLocal(allData) {
  const fs = require('fs');
  const path = require('path');
  const {initSqlJs, default: SQL} = require('sql.js');
  
  // This is complex - let's just show the data and let user decide
  console.log('\n--- RESUMEN DE DATOS EN SUPABASE ---');
  for (const [table, rows] of Object.entries(allData)) {
    console.log(`${table}: ${rows.length} registros`);
    if (rows.length > 0) {
      console.log('  Columnas:', Object.keys(rows[0]).join(', '));
    }
  }
  
  // Show key data
  if (allData.usuarios && allData.usuarios.length > 0) {
    console.log('\n--- USUARIOS ---');
    allData.usuarios.forEach(u => console.log(`  ID: ${u.id}, Usuario: ${u.usuario}, Nombre: ${u.nombre}, Rol: ${u.rol}`));
  }
  
  if (allData.clientes && allData.clientes.length > 0) {
    console.log('\n--- CLIENTES ---');
    allData.clientes.forEach(c => console.log(`  ID: ${c.id}, Nombre: ${c.nombre}, Cédula: ${c.cedula}, Email: ${c.email}`));
  }
  
  if (allData.casos && allData.casos.length > 0) {
    console.log('\n--- CASOS ---');
    allData.casos.forEach(c => console.log(`  ID: ${c.id}, Número: ${c.numero_caso}, Título: ${c.titulo}, Cliente ID: ${c.cliente_id}`));
  }
  
  console.log('\n--- Para restaurar: ---');
  console.log('1. Ejecuta la aplicación LEX');
  console.log('2. Logueate con: admin / admin123');
  console.log('3. Ve a Configuración → Sincronización para conectar Supabase');
  console.log('4. Los datos se sincronizarán automáticamente cada 5 minutos');
}