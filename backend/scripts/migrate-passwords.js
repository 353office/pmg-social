const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || 'school.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const users = db.prepare('SELECT id, password FROM users').all();
let updated = 0;

const update = db.prepare('UPDATE users SET password = ? WHERE id = ?');

for (const u of users) {
  const p = u.password;
  const isHash = typeof p === 'string' && p.startsWith('$2');
  if (isHash) continue;

  const hashed = bcrypt.hashSync(String(p), 12);
  update.run(hashed, u.id);
  updated++;
}

console.log(`Done. Updated ${updated} user password(s).`);
