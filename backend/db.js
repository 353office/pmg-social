
const { Pool } = require('pg');

/**
 * Light wrapper to keep existing better-sqlite3 style call sites:
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).all(...params)
 *   db.prepare(sql).run(...params)
 *
 * It converts SQLite '?' placeholders -> Postgres '$1, $2, ...' and executes via pg Pool.
 */
function convertPlaceholders(sql) {
  let i = 0;
  // Replace each '?' with $<n>
  return sql.replace(/\?/g, () => {
    i += 1;
    return `$${i}`;
  });
}

function splitSqlStatements(sql) {
  // Very small splitter for schema-like SQL (no semicolons inside strings expected)
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

function createDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required (PostgreSQL connection string).');
  }

  const sslEnabled = String(process.env.PGSSL || '').toLowerCase() === 'true';
  const rejectUnauthorized = String(process.env.PGSSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false';

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized } : undefined,
  });

  return {
    pool,
    async exec(sql) {
      const stmts = splitSqlStatements(sql);
      for (const stmt of stmts) {
        await pool.query(stmt);
      }
    },
    prepare(sql) {
      const pgSql = convertPlaceholders(sql);
      return {
        async get(...params) {
          const res = await pool.query(pgSql, params);
          return res.rows[0] || undefined;
        },
        async all(...params) {
          const res = await pool.query(pgSql, params);
          return res.rows;
        },
        async run(...params) {
          const res = await pool.query(pgSql, params);
          return { changes: res.rowCount };
        },
      };
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = { createDB };
