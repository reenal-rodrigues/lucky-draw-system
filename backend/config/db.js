const { Pool } = require('pg');
const { PGlite } = require('@electric-sql/pglite');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbUrl = (process.env.DATABASE_URL || 'local').trim();
const isRemotePostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');

let pool;
let pgliteInstance = null;

// Simple async mutex to serialize explicit transaction checkouts on single-connection PGlite
class AsyncMutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }

  acquire() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this._locked) {
          this._locked = true;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            this._locked = false;
            if (this._queue.length > 0) {
              const next = this._queue.shift();
              next();
            }
          });
        } else {
          this._queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
}

const txMutex = new AsyncMutex();

if (isRemotePostgres) {
  const useSsl =
    process.env.DATABASE_SSL === 'true' ||
    dbUrl.includes('supabase.co') ||
    dbUrl.includes('supabase.com') ||
    dbUrl.includes('render.com');

  pool = new Pool({
    connectionString: dbUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL Pool Error:', err.message);
  });
} else {
  const dataDir =
    dbUrl === 'memory'
      ? undefined
      : path.join(__dirname, '..', 'database', 'pgdata');

  if (dataDir && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  pgliteInstance = new PGlite(dataDir);

  pool = {
    isEmbedded: true,
    async query(text, params = []) {
      const unlock = await txMutex.acquire();
      try {
        const res = await pgliteInstance.query(text, params);
        return {
          rows: res.rows || [],
          rowCount: typeof res.affectedRows === 'number' ? res.affectedRows : (res.rows ? res.rows.length : 0),
        };
      } finally {
        unlock();
      }
    },
    async exec(sqlText) {
      const unlock = await txMutex.acquire();
      try {
        return await pgliteInstance.exec(sqlText);
      } finally {
        unlock();
      }
    },
    async connect() {
      const unlock = await txMutex.acquire();
      return {
        async query(text, params = []) {
          const res = await pgliteInstance.query(text, params);
          return {
            rows: res.rows || [],
            rowCount: typeof res.affectedRows === 'number' ? res.affectedRows : (res.rows ? res.rows.length : 0),
          };
        },
        release() {
          unlock();
        },
      };
    },
    async end() {
      if (pgliteInstance && !pgliteInstance.closed) {
        await pgliteInstance.close();
      }
    },
  };
}

/**
 * Helper to execute queries directly on the pool
 */
const query = (text, params) => pool.query(text, params);

/**
 * Helper to execute a callback inside a PostgreSQL transaction (BEGIN ... COMMIT/ROLLBACK)
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback error:', rollbackErr.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  isRemotePostgres,
};

