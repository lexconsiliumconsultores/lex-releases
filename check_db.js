const SQL = require('sql.js');
const fs = require('fs');
const dbPath = 'C:\\Users\\CASA\\AppData\\Roaming\\LEX\\lex.db';
const db = new SQL.Database(fs.readFileSync(dbPath));
const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
console.log('Tables:', tables[0] ? tables[0].values.map(r => r.name) : 'none');
const usersResult = db.exec("SELECT * FROM usuarios");
console.log('Usuarios result:', usersResult[0] ? 'has data' : 'empty');
const clientesResult = db.exec("SELECT * FROM clientes");
console.log('Clientes result:', clientesResult[0] ? 'has ' + clientesResult[0].values.length + ' rows' : 'empty');
if (clientesResult[0] && clientesResult[0].values.length > 0) {
  console.log('Primer cliente:', clientesResult[0].values[0]);
}
db.close();