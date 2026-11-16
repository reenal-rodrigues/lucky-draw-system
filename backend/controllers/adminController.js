const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { query, withTransaction } = require('../config/db');
const { formatTicketNumber, normalizeTicketInput } = require('../utils/ticketFormatter');
const { releaseExpiredReservations } = require('../services/reservationCleaner');
const { logActivity } = require('../services/activityLogger');
const { getSettingsMap } = require('./bookingController');

/**
 * GET /api/admin/dashboard
 * Complete statistics, seller performance report, recent bookings, and recent transactions.
 */
async function getAdminDashboard(req, res) {
  try {
    await releaseExpiredReservations();

    // 1. Ticket Summary Counts
    const ticketStatsRes = await query(`
      SELECT
        COUNT(*)::int AS total_tickets,
        COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available_tickets,
        COUNT(*) FILTER (WHERE status = 'RESERVED')::int AS reserved_tickets,
        COUNT(*) FILTER (WHERE status IN ('SOLD', 'REDEEMED'))::int AS sold_tickets,
        COUNT(*) FILTER (WHERE status = 'REDEEMED')::int AS redeemed_tickets,
        COALESCE(SUM(ticket_price) FILTER (WHERE status IN ('SOLD', 'REDEEMED') AND payment_status = 'Paid'), 0)::numeric(10,2) AS total_collection,
        COALESCE(SUM(ticket_price) FILTER (WHERE status = 'RESERVED'), 0)::numeric(10,2) AS pending_payments_amount
      FROM tickets
    `);

    // 2. Seller Counts
    const sellerStatsRes = await query(`
      SELECT
        COUNT(*)::int AS total_sellers,
        COUNT(*) FILTER (WHERE u.is_active = TRUE)::int AS active_sellers
      FROM sellers s
      JOIN users u ON u.id = s.user_id
    `);

    // 3. Payment Method Breakdown from Transactions
    const txStatsRes = await query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Paid' AND payment_method = 'Cash'), 0)::numeric(10,2) AS total_cash,
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Paid' AND payment_method = 'UPI'), 0)::numeric(10,2) AS total_upi,
        COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Pending'), 0)::numeric(10,2) AS pending_tx_amount,
        COUNT(*) FILTER (WHERE payment_status = 'Paid')::int AS paid_tx_count
      FROM transactions
    `);

    // 4. Settlements Total
    const settlementStatsRes = await query(`
      SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_settled
      FROM settlements
    `);

    // 5. Seller-wise Performance Table (automatically calculated from confirmed sales)
    const sellersPerformanceRes = await query(`
      SELECT
        s.id AS seller_id,
        u.id AS user_id,
        u.name AS seller_name,
        u.username,
        u.mobile,
        u.is_active,
        s.seller_code,
        COUNT(tk.id) FILTER (WHERE tk.status IN ('SOLD', 'REDEEMED'))::int AS tickets_sold,
        COUNT(tk.id) FILTER (WHERE tk.status = 'RESERVED')::int AS reserved_count,
        COALESCE(SUM(tk.ticket_price) FILTER (WHERE tk.status IN ('SOLD', 'REDEEMED') AND tk.payment_status = 'Paid'), 0)::numeric(10,2) AS total_collected,
        COALESCE(SUM(tk.ticket_price) FILTER (WHERE tk.status IN ('SOLD', 'REDEEMED') AND tk.payment_status = 'Paid' AND tk.payment_method = 'Cash'), 0)::numeric(10,2) AS cash_collected,
        COALESCE(SUM(tk.ticket_price) FILTER (WHERE tk.status IN ('SOLD', 'REDEEMED') AND tk.payment_status = 'Paid' AND tk.payment_method = 'UPI'), 0)::numeric(10,2) AS upi_collected,
        COALESCE((SELECT SUM(st.amount) FROM settlements st WHERE st.seller_id = s.id), 0)::numeric(10,2) AS amount_submitted
      FROM sellers s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN tickets tk ON tk.seller_id = s.id
      GROUP BY s.id, u.id, u.name, u.username, u.mobile, u.is_active, s.seller_code
      ORDER BY tickets_sold DESC, s.seller_code ASC
    `);

    const sellersPerformance = sellersPerformanceRes.rows.map((row) => {
      const collected = parseFloat(row.total_collected || '0');
      const submitted = parseFloat(row.amount_submitted || '0');
      return {
        ...row,
        total_collected: collected,
        cash_collected: parseFloat(row.cash_collected || '0'),
        upi_collected: parseFloat(row.upi_collected || '0'),
        amount_submitted: submitted,
        outstanding_amount: Math.max(0, collected - submitted),
      };
    });

    // 6. Recent Bookings
    const recentBookingsRes = await query(`
      SELECT
        tk.id, tk.ticket_number, tk.status, tk.payment_status, tk.payment_method,
        tk.ticket_price, tk.booked_at, tk.confirmed_at, tk.verification_token,
        s.id AS seller_id, s.seller_code, u.name AS seller_name,
        c.full_name AS customer_name, c.mobile AS customer_mobile
      FROM tickets tk
      LEFT JOIN sellers s ON s.id = tk.seller_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN customers c ON c.id = tk.customer_id
      WHERE tk.status IN ('RESERVED', 'SOLD', 'REDEEMED')
      ORDER BY tk.updated_at DESC
      LIMIT 25
    `);

    // 7. Recent Transactions
    const recentTransactionsRes = await query(`
      SELECT
        tx.id, tx.ticket_id, tk.ticket_number, tx.amount, tx.payment_method,
        tx.payment_status, tx.transaction_reference, tx.created_at,
        s.seller_code, u.name AS seller_name,
        c.full_name AS customer_name, c.mobile AS customer_mobile
      FROM transactions tx
      JOIN tickets tk ON tk.id = tx.ticket_id
      JOIN sellers s ON s.id = tx.seller_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN customers c ON c.id = tx.customer_id
      ORDER BY tx.created_at DESC
      LIMIT 25
    `);

    const tStats = ticketStatsRes.rows[0];
    const sStats = sellerStatsRes.rows[0];
    const txStats = txStatsRes.rows[0];
    const stStats = settlementStatsRes.rows[0];

    const totalCollection = parseFloat(tStats.total_collection || '0');
    const totalSettled = parseFloat(stStats.total_settled || '0');
    const pendingSettlements = sellersPerformance.reduce(
      (acc, s) => acc + s.outstanding_amount,
      0
    );

    const settings = await getSettingsMap();

    return res.json({
      success: true,
      summary: {
        totalSellers: sStats.total_sellers,
        activeSellers: sStats.active_sellers,
        totalTickets: tStats.total_tickets,
        ticketsSold: tStats.sold_tickets,
        availableTickets: tStats.available_tickets,
        reservedTickets: tStats.reserved_tickets,
        redeemedTickets: tStats.redeemed_tickets,
        totalCollection,
        totalCashPayments: parseFloat(txStats.total_cash || '0'),
        totalUpiPayments: parseFloat(txStats.total_upi || '0'),
        pendingPayments: parseFloat(tStats.pending_payments_amount || '0'),
        totalSettledWithAdmin: totalSettled,
        pendingSettlements,
      },
      settings: {
        eventName: settings.event_name,
        eventSubtitle: settings.event_subtitle,
        ticketPrice: parseFloat(settings.ticket_price || '50'),
        reservationExpiryMinutes: parseInt(settings.reservation_expiry_minutes || '5', 10),
        salesEnabled: settings.sales_enabled === 'true',
      },
      sellerPerformance: sellersPerformance,
      recentBookings: recentBookingsRes.rows.map((b) => ({
        ...b,
        ticket_price: parseFloat(b.ticket_price),
        downloadUrl: b.verification_token
          ? `/api/public/tickets/${b.verification_token}/download.jpg`
          : null,
      })),
      recentTransactions: recentTransactionsRes.rows.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
      })),
    });
  } catch (err) {
    console.error('getAdminDashboard error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load admin dashboard.',
    });
  }
}

/**
 * GET /api/admin/sellers/:sellerId/sales
 * Drill-down when Admin clicks a seller's name (e.g., Reenal) to see all tickets sold by that seller.
 */
async function getSellerSalesDetail(req, res) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);

    const sellerRes = await query(
      `SELECT s.id AS seller_id, s.seller_code, s.total_tickets_sold, s.created_at,
              u.id AS user_id, u.name AS seller_name, u.username, u.mobile, u.is_active
       FROM sellers s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [sellerId]
    );

    if (sellerRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found.',
      });
    }

    const ticketsRes = await query(
      `SELECT tk.id, tk.ticket_number, tk.status, tk.payment_status, tk.payment_method,
              tk.ticket_price, tk.booked_at, tk.confirmed_at, tk.verification_token,
              c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM tickets tk
       LEFT JOIN customers c ON c.id = tk.customer_id
       WHERE tk.seller_id = $1 AND tk.status IN ('SOLD', 'REDEEMED', 'RESERVED')
       ORDER BY CAST(tk.ticket_number AS INTEGER) ASC`,
      [sellerId]
    );

    const settlementsRes = await query(
      `SELECT id, amount, settlement_date, payment_reference, notes
       FROM settlements
       WHERE seller_id = $1
       ORDER BY settlement_date DESC`,
      [sellerId]
    );

    const confirmedTickets = ticketsRes.rows.filter(
      (t) => t.status === 'SOLD' || t.status === 'REDEEMED'
    );
    const totalCollected = confirmedTickets.reduce(
      (sum, t) => sum + parseFloat(t.ticket_price || '0'),
      0
    );
    const totalSubmitted = settlementsRes.rows.reduce(
      (sum, st) => sum + parseFloat(st.amount || '0'),
      0
    );

    return res.json({
      success: true,
      seller: {
        ...sellerRes.rows[0],
        ticketsSoldCount: confirmedTickets.length,
        totalCollected,
        totalSubmitted,
        outstandingBalance: Math.max(0, totalCollected - totalSubmitted),
      },
      tickets: ticketsRes.rows.map((t) => ({
        ...t,
        ticket_price: parseFloat(t.ticket_price),
        downloadUrl: t.verification_token
          ? `/api/public/tickets/${t.verification_token}/download.jpg`
          : null,
      })),
      settlements: settlementsRes.rows.map((st) => ({
        ...st,
        amount: parseFloat(st.amount),
      })),
    });
  } catch (err) {
    console.error('getSellerSalesDetail error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load seller sales details.',
    });
  }
}

/**
 * POST /api/admin/sellers
 * Create a new seller account.
 */
async function createSeller(req, res) {
  try {
    const { name, username, password, mobile, sellerCode } = req.body;
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const cleanMobile = String(mobile || '').trim();

    const passwordHash = await bcrypt.hash(String(password || 'Seller@123'), 10);

    const newSeller = await withTransaction(async (client) => {
      const existingUser = await client.query(
        `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
        [cleanUsername]
      );
      if (existingUser.rows.length > 0) {
        const err = new Error(`Username "${cleanUsername}" is already in use.`);
        err.statusCode = 409;
        throw err;
      }

      let code = String(sellerCode || '').trim().toUpperCase();
      if (!code) {
        const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM sellers`);
        const nextNum = countRes.rows[0].cnt + 1;
        code = `SLR-${String(nextNum).padStart(3, '0')}`;
      }

      const userInsert = await client.query(
        `INSERT INTO users (name, username, password_hash, role, mobile, is_active)
         VALUES ($1, $2, $3, 'SELLER', $4, TRUE)
         RETURNING id, name, username, role, mobile, is_active, created_at`,
        [cleanName, cleanUsername, passwordHash, cleanMobile]
      );

      const sellerInsert = await client.query(
        `INSERT INTO sellers (user_id, seller_code, total_tickets_sold)
         VALUES ($1, $2, 0)
         RETURNING id, seller_code, total_tickets_sold`,
        [userInsert.rows[0].id, code]
      );

      await logActivity({
        userId: req.user.id,
        action: 'CREATE_SELLER',
        description: `Admin created seller "${cleanName}" (${cleanUsername} / ${code})`,
        client,
      });

      return {
        ...userInsert.rows[0],
        seller_id: sellerInsert.rows[0].id,
        seller_code: sellerInsert.rows[0].seller_code,
      };
    });

    return res.status(201).json({
      success: true,
      message: `Seller "${newSeller.name}" (${newSeller.seller_code}) created successfully.`,
      seller: newSeller,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to create seller.',
    });
  }
}

/**
 * POST /api/admin/sellers/ensure-50
 * Ensures all 50 authorized seller accounts exist (creates any missing seller01..seller50).
 */
async function ensureFiftySellers(req, res) {
  try {
    const defaultPassword = req.body.defaultPassword || 'Seller@123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    let createdCount = 0;

    await withTransaction(async (client) => {
      for (let i = 1; i <= 50; i++) {
        const paddedTwo = String(i).padStart(2, '0');
        const paddedThree = String(i).padStart(3, '0');
        const username = `seller${paddedTwo}`;
        const sellerName = i === 1 ? 'Reenal' : `Seller ${paddedTwo}`;
        const sellerCode = `SLR-${paddedThree}`;
        const mobile = `98000000${paddedTwo}`;

        const checkRes = await client.query(
          `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
          [username]
        );

        if (checkRes.rows.length === 0) {
          const uRes = await client.query(
            `INSERT INTO users (name, username, password_hash, role, mobile, is_active)
             VALUES ($1, $2, $3, 'SELLER', $4, TRUE)
             RETURNING id`,
            [sellerName, username, passwordHash, mobile]
          );

          await client.query(
            `INSERT INTO sellers (user_id, seller_code, total_tickets_sold)
             VALUES ($1, $2, 0)
             ON CONFLICT (seller_code) DO NOTHING`,
            [uRes.rows[0].id, sellerCode]
          );
          createdCount++;
        }
      }

      await logActivity({
        userId: req.user.id,
        action: 'ENSURE_50_SELLERS',
        description: `Admin verified 50 seller accounts (${createdCount} new accounts added)`,
        client,
      });
    });

    return res.json({
      success: true,
      message:
        createdCount > 0
          ? `Created ${createdCount} missing seller accounts. All 50 seller accounts are ready.`
          : 'All 50 authorized seller accounts (seller01 to seller50) are already active.',
      createdCount,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to generate 50 seller accounts.',
    });
  }
}

/**
 * PUT /api/admin/sellers/:sellerId
 * Edit seller information (name, mobile, username, seller_code).
 */
async function updateSeller(req, res) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);
    const { name, mobile, username, sellerCode } = req.body;

    await withTransaction(async (client) => {
      const sRes = await client.query(
        `SELECT s.id, s.user_id, s.seller_code, u.name, u.username, u.mobile
         FROM sellers s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1`,
        [sellerId]
      );

      if (sRes.rows.length === 0) {
        const err = new Error('Seller not found.');
        err.statusCode = 404;
        throw err;
      }

      const curr = sRes.rows[0];
      const nextName = name ? String(name).trim() : curr.name;
      const nextMobile = mobile !== undefined ? String(mobile).trim() : curr.mobile;
      const nextUsername = username ? String(username).trim().toLowerCase() : curr.username;
      const nextCode = sellerCode ? String(sellerCode).trim().toUpperCase() : curr.seller_code;

      await client.query(
        `UPDATE users SET name = $1, mobile = $2, username = $3 WHERE id = $4`,
        [nextName, nextMobile, nextUsername, curr.user_id]
      );

      await client.query(
        `UPDATE sellers SET seller_code = $1 WHERE id = $2`,
        [nextCode, sellerId]
      );

      await logActivity({
        userId: req.user.id,
        action: 'UPDATE_SELLER',
        description: `Admin updated seller #${sellerId} (${nextName} / ${nextCode})`,
        client,
      });
    });

    return res.json({
      success: true,
      message: 'Seller information updated successfully.',
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to update seller information.',
    });
  }
}

/**
 * PATCH /api/admin/sellers/:sellerId/status
 * Activate or deactivate a seller account.
 */
async function toggleSellerStatus(req, res) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);
    const { isActive } = req.body;

    await withTransaction(async (client) => {
      const sRes = await client.query(
        `SELECT s.user_id, s.seller_code, u.name
         FROM sellers s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1`,
        [sellerId]
      );

      if (sRes.rows.length === 0) {
        const err = new Error('Seller not found.');
        err.statusCode = 404;
        throw err;
      }

      const seller = sRes.rows[0];
      await client.query(
        `UPDATE users SET is_active = $1 WHERE id = $2`,
        [Boolean(isActive), seller.user_id]
      );

      await logActivity({
        userId: req.user.id,
        action: isActive ? 'ACTIVATE_SELLER' : 'DEACTIVATE_SELLER',
        description: `Admin ${isActive ? 'activated' : 'deactivated'} seller ${seller.name} (${seller.seller_code})`,
        client,
      });
    });

    return res.json({
      success: true,
      message: `Seller account ${isActive ? 'activated' : 'deactivated'} successfully.`,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to change seller status.',
    });
  }
}

/**
 * POST /api/admin/sellers/:sellerId/reset-password
 * Reset a seller's password.
 */
async function resetSellerPassword(req, res) {
  try {
    const sellerId = parseInt(req.params.sellerId, 10);
    const { newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    await withTransaction(async (client) => {
      const sRes = await client.query(
        `SELECT s.user_id, s.seller_code, u.name, u.username
         FROM sellers s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1`,
        [sellerId]
      );

      if (sRes.rows.length === 0) {
        const err = new Error('Seller not found.');
        err.statusCode = 404;
        throw err;
      }

      const seller = sRes.rows[0];
      await client.query(
        `UPDATE users SET password_hash = $1 WHERE id = $2`,
        [passwordHash, seller.user_id]
      );

      await logActivity({
        userId: req.user.id,
        action: 'RESET_SELLER_PASSWORD',
        description: `Admin reset password for seller ${seller.name} (${seller.username})`,
        client,
      });
    });

    return res.json({
      success: true,
      message: 'Seller password has been reset successfully.',
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to reset seller password.',
    });
  }
}

/**
 * POST /api/admin/tickets/configure
 * Configure total ticket quantity (e.g., 001..999, 1000+), ticket price, reservation expiry, event name, and sales status.
 */
async function configureTicketsAndSettings(req, res) {
  try {
    const {
      totalTickets,
      ticketPrice,
      reservationExpiryMinutes,
      eventName,
      eventSubtitle,
      salesEnabled,
    } = req.body;

    const result = await withTransaction(async (client) => {
      if (eventName !== undefined) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('event_name', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [String(eventName).trim()]
        );
      }

      if (eventSubtitle !== undefined) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('event_subtitle', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [String(eventSubtitle).trim()]
        );
      }

      if (ticketPrice !== undefined && !isNaN(parseFloat(ticketPrice))) {
        const priceVal = parseFloat(ticketPrice);
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('ticket_price', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [String(priceVal)]
        );
        // Update price of AVAILABLE tickets
        await client.query(
          `UPDATE tickets SET ticket_price = $1 WHERE status = 'AVAILABLE'`,
          [priceVal]
        );
      }

      if (reservationExpiryMinutes !== undefined && !isNaN(parseInt(reservationExpiryMinutes, 10))) {
        const expMins = Math.max(1, parseInt(reservationExpiryMinutes, 10));
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('reservation_expiry_minutes', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [String(expMins)]
        );
      }

      if (salesEnabled !== undefined) {
        await client.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('sales_enabled', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [salesEnabled ? 'true' : 'false']
        );
      }

      let addedTickets = 0;
      let removedTickets = 0;

      if (totalTickets !== undefined && !isNaN(parseInt(totalTickets, 10))) {
        const targetTotal = parseInt(totalTickets, 10);
        if (targetTotal < 1 || targetTotal > 10000) {
          const err = new Error('Total ticket quantity must be between 1 and 10,000.');
          err.statusCode = 400;
          throw err;
        }

        const settings = await getSettingsMap(client);
        const currentPrice = parseFloat(settings.ticket_price || '50');

        // Ensure tickets 1..targetTotal exist
        for (let i = 1; i <= targetTotal; i++) {
          const tNum = formatTicketNumber(i);
          const ins = await client.query(
            `INSERT INTO tickets (ticket_number, status, ticket_price)
             VALUES ($1, 'AVAILABLE', $2)
             ON CONFLICT (ticket_number) DO NOTHING
             RETURNING id`,
            [tNum, currentPrice]
          );
          if (ins.rows.length > 0) addedTickets++;
        }

        // If reducing total tickets before sales, only remove AVAILABLE tickets above targetTotal
        const delRes = await client.query(
          `DELETE FROM tickets
           WHERE CAST(ticket_number AS INTEGER) > $1
             AND status = 'AVAILABLE'
           RETURNING id`,
          [targetTotal]
        );
        removedTickets = delRes.rows.length;
      }

      await logActivity({
        userId: req.user.id,
        action: 'UPDATE_SYSTEM_CONFIG',
        description: `Admin updated ticket/system configuration (added ${addedTickets}, removed ${removedTickets} available tickets)`,
        client,
      });

      const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM tickets`);
      return {
        totalTicketsNow: countRes.rows[0].total,
        addedTickets,
        removedTickets,
      };
    });

    return res.json({
      success: true,
      message: `Configuration saved. Total tickets in pool: ${result.totalTicketsNow}.`,
      data: result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to update configuration.',
    });
  }
}

/**
 * PATCH /api/admin/tickets/:ticketId/status
 * Manage ticket status (e.g., mark SOLD ticket as REDEEMED, or release RESERVED ticket, or Refund).
 */
async function updateTicketStatusByAdmin(req, res) {
  try {
    const ticketId = parseInt(req.params.ticketId, 10);
    const { status } = req.body;

    if (!['AVAILABLE', 'SOLD', 'REDEEMED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Target status must be AVAILABLE, SOLD, or REDEEMED.',
      });
    }

    await withTransaction(async (client) => {
      const tRes = await client.query(
        `SELECT * FROM tickets WHERE id = $1 FOR UPDATE`,
        [ticketId]
      );

      if (tRes.rows.length === 0) {
        const err = new Error('Ticket not found.');
        err.statusCode = 404;
        throw err;
      }

      const ticket = tRes.rows[0];
      const oldSellerId = ticket.seller_id;

      if (status === 'AVAILABLE') {
        // If releasing/refunding a ticket back to AVAILABLE
        if (ticket.status === 'SOLD' || ticket.status === 'REDEEMED') {
          await client.query(
            `UPDATE transactions
             SET payment_status = 'Refunded'
             WHERE ticket_id = $1 AND payment_status = 'Paid'`,
            [ticketId]
          );
        }

        await client.query(
          `UPDATE tickets
           SET status = 'AVAILABLE',
               seller_id = NULL,
               customer_id = NULL,
               reservation_token = NULL,
               reservation_expires_at = NULL,
               verification_token = NULL,
               payment_status = 'Pending',
               payment_method = NULL,
               booked_at = NULL,
               confirmed_at = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [ticketId]
        );
      } else {
        await client.query(
          `UPDATE tickets
           SET status = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [status, ticketId]
        );
      }

      if (oldSellerId) {
        await client.query(
          `UPDATE sellers
           SET total_tickets_sold = (
             SELECT COUNT(*)::int FROM tickets
             WHERE seller_id = $1 AND status IN ('SOLD', 'REDEEMED')
           )
           WHERE id = $1`,
          [oldSellerId]
        );
      }

      await logActivity({
        userId: req.user.id,
        action: 'ADMIN_TICKET_STATUS_CHANGE',
        description: `Admin changed ticket #${ticket.ticket_number} status from ${ticket.status} to ${status}`,
        client,
      });
    });

    return res.json({
      success: true,
      message: `Ticket status updated to ${status}.`,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to update ticket status.',
    });
  }
}

/**
 * GET /api/admin/customers
 * View all customers and search by customer name or mobile number.
 */
async function listCustomers(req, res) {
  try {
    const { search } = req.query;
    const params = [];
    let whereClause = '';

    if (search && String(search).trim() !== '') {
      params.push(`%${String(search).trim()}%`);
      whereClause = `WHERE c.full_name ILIKE $1 OR c.mobile ILIKE $1 OR tk.ticket_number ILIKE $1`;
    }

    const customersRes = await query(
      `SELECT
         c.id, c.full_name, c.mobile, c.created_at,
         tk.id AS ticket_id, tk.ticket_number, tk.status AS ticket_status,
         tk.payment_status, tk.payment_method, tk.ticket_price,
         tk.confirmed_at, tk.verification_token,
         s.id AS seller_id, s.seller_code, u.name AS seller_name
       FROM customers c
       LEFT JOIN tickets tk ON tk.customer_id = c.id
       LEFT JOIN sellers s ON s.id = tk.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      params
    );

    return res.json({
      success: true,
      customers: customersRes.rows.map((row) => ({
        ...row,
        ticket_price: row.ticket_price ? parseFloat(row.ticket_price) : null,
        downloadUrl: row.verification_token
          ? `/api/public/tickets/${row.verification_token}/download.jpg`
          : null,
      })),
    });
  } catch (err) {
    console.error('listCustomers error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load customers.',
    });
  }
}

/**
 * GET /api/admin/transactions
 * View all payment transactions with optional filters.
 */
async function listTransactions(req, res) {
  try {
    const { paymentMethod, paymentStatus, sellerId } = req.query;
    const params = [];
    const conditions = [];

    if (paymentMethod) {
      params.push(paymentMethod);
      conditions.push(`tx.payment_method = $${params.length}`);
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      conditions.push(`tx.payment_status = $${params.length}`);
    }
    if (sellerId) {
      params.push(parseInt(sellerId, 10));
      conditions.push(`tx.seller_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const txRes = await query(
      `SELECT
         tx.id, tx.ticket_id, tk.ticket_number, tx.amount,
         tx.payment_method, tx.payment_status, tx.transaction_reference, tx.created_at,
         s.id AS seller_id, s.seller_code, u.name AS seller_name,
         c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM transactions tx
       JOIN tickets tk ON tk.id = tx.ticket_id
       JOIN sellers s ON s.id = tx.seller_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = tx.customer_id
       ${whereClause}
       ORDER BY tx.created_at DESC`,
      params
    );

    return res.json({
      success: true,
      transactions: txRes.rows.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load transactions.',
    });
  }
}

/**
 * POST /api/admin/settlements
 * Record money submitted by a seller to the administrator.
 */
async function createSettlement(req, res) {
  try {
    const { sellerId, amount, paymentReference, notes } = req.body;
    const parsedSellerId = parseInt(sellerId, 10);
    const parsedAmount = parseFloat(amount);

    if (!parsedSellerId || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid seller and positive settlement amount are required.',
      });
    }

    const settlement = await withTransaction(async (client) => {
      const sRes = await client.query(
        `SELECT s.id, s.seller_code, u.name
         FROM sellers s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1`,
        [parsedSellerId]
      );

      if (sRes.rows.length === 0) {
        const err = new Error('Seller not found.');
        err.statusCode = 404;
        throw err;
      }

      const seller = sRes.rows[0];
      const ins = await client.query(
        `INSERT INTO settlements (seller_id, amount, payment_reference, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          parsedSellerId,
          parsedAmount,
          paymentReference || `STL-${Date.now().toString().slice(-6)}`,
          notes || '',
        ]
      );

      await logActivity({
        userId: req.user.id,
        action: 'RECORD_SETTLEMENT',
        description: `Admin recorded settlement of INR ${parsedAmount.toFixed(2)} from seller ${seller.name} (${seller.seller_code})`,
        client,
      });

      return ins.rows[0];
    });

    return res.status(201).json({
      success: true,
      message: 'Seller settlement recorded successfully.',
      settlement: {
        ...settlement,
        amount: parseFloat(settlement.amount),
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to record settlement.',
    });
  }
}

/**
 * GET /api/admin/settlements
 * List all seller settlements.
 */
async function listSettlements(req, res) {
  try {
    const resList = await query(`
      SELECT st.id, st.seller_id, st.amount, st.settlement_date, st.payment_reference, st.notes,
             s.seller_code, u.name AS seller_name
      FROM settlements st
      JOIN sellers s ON s.id = st.seller_id
      JOIN users u ON u.id = s.user_id
      ORDER BY st.settlement_date DESC
    `);

    return res.json({
      success: true,
      settlements: resList.rows.map((r) => ({
        ...r,
        amount: parseFloat(r.amount),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load settlements.',
    });
  }
}

/**
 * GET /api/admin/activity-logs
 * View complete system activity logs.
 */
async function listActivityLogs(req, res) {
  try {
    const logsRes = await query(`
      SELECT a.id, a.user_id, a.action, a.description, a.created_at,
             u.name AS user_name, u.username, u.role
      FROM activity_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 250
    `);

    return res.json({
      success: true,
      logs: logsRes.rows,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to load activity logs.',
    });
  }
}

/**
 * GET /api/admin/reports/export
 * Export reports to Excel (.xlsx) or CSV (.csv)
 */
async function exportReport(req, res) {
  try {
    const { type = 'sales', format = 'xlsx' } = req.query;
    let rows = [];
    let sheetName = 'Report';

    if (type === 'sellers') {
      sheetName = 'Seller_Performance';
      const q = await query(`
        SELECT
          s.seller_code AS "Seller Code",
          u.name AS "Seller Name",
          u.username AS "Username",
          u.mobile AS "Mobile",
          CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END AS "Status",
          COUNT(tk.id) FILTER (WHERE tk.status IN ('SOLD', 'REDEEMED'))::int AS "Tickets Sold",
          COALESCE(SUM(tk.ticket_price) FILTER (WHERE tk.status IN ('SOLD', 'REDEEMED') AND tk.payment_status = 'Paid'), 0)::float AS "Total Collection (INR)",
          COALESCE((SELECT SUM(st.amount) FROM settlements st WHERE st.seller_id = s.id), 0)::float AS "Submitted to Admin (INR)"
        FROM sellers s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN tickets tk ON tk.seller_id = s.id
        GROUP BY s.id, s.seller_code, u.name, u.username, u.mobile, u.is_active
        ORDER BY "Tickets Sold" DESC, s.seller_code ASC
      `);
      rows = q.rows.map((r) => ({
        ...r,
        'Outstanding Balance (INR)': Math.max(
          0,
          (r['Total Collection (INR)'] || 0) - (r['Submitted to Admin (INR)'] || 0)
        ),
      }));
    } else if (type === 'transactions') {
      sheetName = 'Transactions';
      const q = await query(`
        SELECT
          tx.id AS "Transaction ID",
          tk.ticket_number AS "Ticket Number",
          u.name AS "Seller Name",
          s.seller_code AS "Seller Code",
          c.full_name AS "Customer Name",
          c.mobile AS "Customer Mobile",
          tx.amount::float AS "Amount (INR)",
          tx.payment_method AS "Payment Method",
          tx.payment_status AS "Payment Status",
          tx.transaction_reference AS "Reference",
          tx.created_at AS "Date"
        FROM transactions tx
        JOIN tickets tk ON tk.id = tx.ticket_id
        JOIN sellers s ON s.id = tx.seller_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN customers c ON c.id = tx.customer_id
        ORDER BY tx.created_at DESC
      `);
      rows = q.rows;
    } else {
      // Default: All Sold / Reserved Tickets Report
      sheetName = 'Ticket_Sales';
      const q = await query(`
        SELECT
          tk.ticket_number AS "Ticket Number",
          tk.status AS "Ticket Status",
          COALESCE(c.full_name, '-') AS "Customer Name",
          COALESCE(c.mobile, '-') AS "Customer Mobile",
          COALESCE(u.name, '-') AS "Seller Name",
          COALESCE(s.seller_code, '-') AS "Seller Code",
          tk.payment_status AS "Payment Status",
          COALESCE(tk.payment_method, '-') AS "Payment Method",
          tk.ticket_price::float AS "Price (INR)",
          tk.confirmed_at AS "Confirmed At"
        FROM tickets tk
        LEFT JOIN sellers s ON s.id = tk.seller_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN customers c ON c.id = tk.customer_id
        ORDER BY CAST(tk.ticket_number AS INTEGER) ASC
      `);
      rows = q.rows;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    if (String(format).toLowerCase() === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="LuckyDraw_${sheetName}_${Date.now()}.csv"`
      );
      return res.send(csvContent);
    }

    const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="LuckyDraw_${sheetName}_${Date.now()}.xlsx"`
    );
    return res.send(xlsxBuffer);
  } catch (err) {
    console.error('exportReport error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to export report.',
    });
  }
}

module.exports = {
  getAdminDashboard,
  getSellerSalesDetail,
  createSeller,
  ensureFiftySellers,
  updateSeller,
  toggleSellerStatus,
  resetSellerPassword,
  configureTicketsAndSettings,
  updateTicketStatusByAdmin,
  listCustomers,
  listTransactions,
  createSettlement,
  listSettlements,
  listActivityLogs,
  exportReport,
};

