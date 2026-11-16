const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, withTransaction } = require('../config/db');
const { formatTicketNumber } = require('../utils/ticketFormatter');

async function initializeDatabase({ seedDefaults = true } = {}) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  if (pool.isEmbedded && typeof pool.exec === 'function') {
    await pool.exec(schemaSql);
  } else {
    await query(schemaSql);
  }

  if (!seedDefaults) {
    return;
  }

  // 1. Ensure Default Admin User exists
  const adminCheck = await query(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);
  let adminUserId;

  if (adminCheck.rows.length === 0) {
    const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123', 10);
    const adminInsert = await query(
      `INSERT INTO users (name, username, password_hash, role, mobile, is_active)
       VALUES ($1, $2, $3, 'ADMIN', $4, TRUE)
       RETURNING id`,
      ['System Administrator', 'admin', adminPasswordHash, '9000000000']
    );
    adminUserId = adminInsert.rows[0].id;

    await query(
      `INSERT INTO activity_logs (user_id, action, description)
       VALUES ($1, 'SYSTEM_INIT', 'Default administrator account (admin) initialized')`,
      [adminUserId]
    );
  } else {
    adminUserId = adminCheck.rows[0].id;
  }

  // 2. Ensure 50 Authorized Seller Accounts exist if none exist yet
  const sellerCountRes = await query(`SELECT COUNT(*)::int AS count FROM sellers`);
  const existingSellers = sellerCountRes.rows[0].count;

  if (existingSellers === 0) {
    const defaultSellerPasswordHash = await bcrypt.hash(
      process.env.SELLER_INITIAL_PASSWORD || 'Seller@123',
      10
    );

    await withTransaction(async (client) => {
      for (let i = 1; i <= 50; i++) {
        const paddedTwo = String(i).padStart(2, '0');
        const paddedThree = String(i).padStart(3, '0');
        const username = `seller${paddedTwo}`;
        const sellerName = i === 1 ? 'Reenal' : `Seller ${paddedTwo}`;
        const sellerCode = `SLR-${paddedThree}`;
        const mobile = `98000000${paddedTwo}`;

        const userRes = await client.query(
          `INSERT INTO users (name, username, password_hash, role, mobile, is_active)
           VALUES ($1, $2, $3, 'SELLER', $4, TRUE)
           ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [sellerName, username, defaultSellerPasswordHash, mobile]
        );

        await client.query(
          `INSERT INTO sellers (user_id, seller_code, total_tickets_sold)
           VALUES ($1, $2, 0)
           ON CONFLICT (seller_code) DO NOTHING`,
          [userRes.rows[0].id, sellerCode]
        );
      }

      await client.query(
        `INSERT INTO activity_logs (user_id, action, description)
         VALUES ($1, 'SEED_SELLERS', 'Initialized 50 authorized seller accounts (seller01 - seller50)')`,
        [adminUserId]
      );
    });
  }

  // 3. Ensure Initial Ticket Pool exists if no tickets exist yet
  const ticketCountRes = await query(`SELECT COUNT(*)::int AS count FROM tickets`);
  const existingTickets = ticketCountRes.rows[0].count;

  if (existingTickets === 0) {
    const defaultTotal = parseInt(process.env.DEFAULT_TOTAL_TICKETS || '200', 10);
    const defaultPrice = parseFloat(process.env.DEFAULT_TICKET_PRICE || '50');

    await withTransaction(async (client) => {
      for (let i = 1; i <= defaultTotal; i++) {
        const ticketNumber = formatTicketNumber(i);
        await client.query(
          `INSERT INTO tickets (ticket_number, status, ticket_price)
           VALUES ($1, 'AVAILABLE', $2)
           ON CONFLICT (ticket_number) DO NOTHING`,
          [ticketNumber, defaultPrice]
        );
      }

      await client.query(
        `INSERT INTO activity_logs (user_id, action, description)
         VALUES ($1, 'GENERATE_TICKETS', $2)`,
        [adminUserId, `Initialized ${defaultTotal} sequential tickets (001 to ${formatTicketNumber(defaultTotal)})`]
      );
    });
  }
}

module.exports = { initializeDatabase };

