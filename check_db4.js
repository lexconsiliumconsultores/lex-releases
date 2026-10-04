import('sql.js').then(SQL => {
  const db = new SQL.default.Database();
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables[0] ? tables[0].values.map(r => r.name) : 'none');
  const usersResult = db.exec("SELECT count(*) as cnt FROM usuarios");
  console.log('Usuarios count:', usersResult[0] ? usersResult[0].values[0] : 'error');
  const clientesResult = db.exec("SELECT count(*) as cnt FROM clientes");
  console.log('Clientes count:', clientesResult[0] ? clientesResult[0].values[0] : 'error');
  db.close();
}).catch(err => console.error('Error:', err));