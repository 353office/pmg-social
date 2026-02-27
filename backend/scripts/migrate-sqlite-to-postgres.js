require('dotenv').config();
const path = require('path');
const { createDB } = require('../db');
const { migrateSqliteToPostgres } = require('./sqliteMigrator');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'sqlite_backup', 'school.db');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is required (PostgreSQL connection string).");
    process.exit(1);
  }

  console.log("SQLite source:", SQLITE_PATH);

  const pg = createDB();
  await migrateSqliteToPostgres({ sqlitePath: SQLITE_PATH, pg });
  await pg.close();

  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
