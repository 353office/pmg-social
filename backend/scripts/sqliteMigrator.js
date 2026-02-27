const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_ORDER = [
  'users',
  'conversations',
  'conversation_participants',
  'messages',
  'posts',
  'likes',
  'comments',
  'notifications',
  'post_attachments',
  'clubs',
  'club_members',
  'calendar_events',
  'sessions',
];

function getSQLiteTables(sqlite) {
  const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  return rows.map(r => r.name);
}

function getSQLiteColumns(sqlite, table) {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function migrateSqliteToPostgres({ sqlitePath, pg }) {
  const sqlite = new Database(sqlitePath, { readonly: true });

  const tables = getSQLiteTables(sqlite);

  const order = [];
  for (const t of DEFAULT_ORDER) if (tables.includes(t)) order.push(t);
  for (const t of tables) if (!order.includes(t)) order.push(t);

  for (const table of order) {
    const cols = getSQLiteColumns(sqlite, table);
    if (cols.length === 0) continue;

    const quotedCols = cols.map(quoteIdent).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const insertSql = `INSERT INTO ${quoteIdent(table)} (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    const rows = sqlite.prepare(`SELECT ${quotedCols} FROM ${quoteIdent(table)}`).all();
    let inserted = 0;

    for (const row of rows) {
      const params = cols.map(c => row[c]);
      const res = await pg.prepare(insertSql).run(...params);
      if (res && res.changes) inserted += res.changes;
    }

    // eslint-disable-next-line no-console
    console.log(`✓ Migrated ${table}: inserted ${inserted} / ${rows.length}`);
  }

  sqlite.close();
}

module.exports = { migrateSqliteToPostgres };
