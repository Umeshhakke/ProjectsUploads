const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('SQLite connected');
});

module.exports = db;