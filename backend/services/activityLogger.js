const { query } = require('../config/db');

/**
 * Logs an activity in the activity_logs table.
 * Can use either a transaction client or the default pool.
 */
async function logActivity({ userId = null, action, description, client = null }) {
  try {
    const executor = client || { query };
    await executor.query(
      `INSERT INTO activity_logs (user_id, action, description) VALUES ($1, $2, $3)`,
      [userId, action, description]
    );
  } catch (err) {
    console.error('Failed to write activity log:', err.message);
  }
}

module.exports = { logActivity };

