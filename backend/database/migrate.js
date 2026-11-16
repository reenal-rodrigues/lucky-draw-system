const { initializeDatabase } = require('./initDb');
const { pool } = require('../config/db');

async function runMigration() {
  try {
    console.log('Running PostgreSQL schema migration...');
    await initializeDatabase({ seedDefaults: false });
    console.log('Schema migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigration();

