const { initializeDatabase } = require('./initDb');
const { pool } = require('../config/db');

async function runSeed() {
  try {
    console.log('Running database schema migration and initial seed...');
    await initializeDatabase({ seedDefaults: true });
    console.log('Database seeded successfully (Admin + 50 Sellers + Initial Tickets).');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runSeed();

