const { query, withTransaction } = require('../config/db');
const { normalizeTicketInput, generateSecureToken } = require('../utils/ticketFormatter');
const { releaseExpiredReservations } = require('../services/reservationCleaner');
const { generateQrDataUrl, generateTicketJpgBuffer } = require('../services/ticketGeneratorService');
const { logActivity } = require('../services/activityLogger');

/**
 * Helper to fetch system settings as a key-value object
 */
async function getSettingsMap(client = null) {
  const executor = client || { query };
  const res = await executor.query(`SELECT key, value FROM system_settings`);
  const map = {
    event_name: 'GRAND DIGITAL LUCKY DRAW 2026',
    event_subtitle: 'Official Authorized Digital Raffle Ticket',
    ticket_price: '50',
    reservation_expiry_minutes: '5',
    sales_enabled: 'true',
  };
  for (const row of res.rows) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * GET /api/tickets
 * Lists all tickets with current status (AVAILABLE, RESERVED, SOLD, REDEEMED)
 * Automatically releases expired reservations first.
 */
async function listTickets(req, res) {
  try {
    await releaseExpiredReservations();

    const { status, search } = req.query;
    const params = [];
    const conditions = [];

    if (status && ['AVAILABLE', 'RESERVED', 'SOLD', 'REDEEMED'].includes(status.toUpperCase())) {
      params.push(status.toUpperCase());
      conditions.push(`t.status = $${params.length}`);
    }

    if (search && String(search).trim() !== '') {
      const normalized = normalizeTicketInput(search);
      params.push(`%${String(search).trim()}%`);
      params.push(normalized);
      conditions.push(`(t.ticket_number ILIKE $${params.length - 1} OR t.ticket_number = $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const ticketsRes = await query(
      `SELECT t.id, t.ticket_number, t.status, t.seller_id, t.customer_id,
              t.reservation_expires_at, t.payment_status, t.payment_method,
              t.ticket_price, t.booked_at, t.confirmed_at,
              s.seller_code, u.name AS seller_name,
              c.full_name AS customer_name
       FROM tickets t
       LEFT JOIN sellers s ON s.id = t.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = t.customer_id
       ${whereClause}
       ORDER BY CAST(t.ticket_number AS INTEGER) ASC`,
      params
    );

    const summaryRes = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
         COUNT(*) FILTER (WHERE status = 'RESERVED')::int AS reserved,
         COUNT(*) FILTER (WHERE status = 'SOLD')::int AS sold,
         COUNT(*) FILTER (WHERE status = 'REDEEMED')::int AS redeemed
       FROM tickets`
    );

    const settings = await getSettingsMap();

    return res.json({
      success: true,
      summary: summaryRes.rows[0],
      settings: {
        eventName: settings.event_name,
        ticketPrice: parseFloat(settings.ticket_price || '50'),
        reservationExpiryMinutes: parseInt(settings.reservation_expiry_minutes || '5', 10),
        salesEnabled: settings.sales_enabled === 'true',
      },
      tickets: ticketsRes.rows,
    });
  } catch (err) {
    console.error('listTickets error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load tickets.',
    });
  }
}

/**
 * POST /api/tickets/reserve
 * Atomic PostgreSQL transaction with row-level lock (SELECT ... FOR UPDATE)
 * Prevents simultaneous duplicate reservations by two sellers.
 */
async function reserveTicket(req, res) {
  try {
    const sellerId = req.user.sellerId;
    const rawTicketNumber = req.body.ticketNumber;
    const ticketNumber = normalizeTicketInput(rawTicketNumber);

    if (!ticketNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid ticket number.',
      });
    }

    const reservationResult = await withTransaction(async (client) => {
      // 1. Check if ticket sales are enabled by Admin
      const settings = await getSettingsMap(client);
      if (settings.sales_enabled !== 'true') {
        const err = new Error('Ticket sales are currently paused by the administrator.');
        err.statusCode = 403;
        throw err;
      }

      // 2. Release any expired reservations inside the transaction
      await releaseExpiredReservations(client);

      // 3. Row-level lock on the target ticket
      const lockRes = await client.query(
        `SELECT id, ticket_number, status, seller_id, reservation_expires_at
         FROM tickets
         WHERE ticket_number = $1
         FOR UPDATE`,
        [ticketNumber]
      );

      if (lockRes.rows.length === 0) {
        const err = new Error(`Ticket #${ticketNumber} does not exist.`);
        err.statusCode = 404;
        throw err;
      }

      const targetTicket = lockRes.rows[0];

      // 4. Strict availability check under lock
      if (targetTicket.status !== 'AVAILABLE') {
        const err = new Error(
          'This ticket has already been reserved by another seller. Please select another ticket.'
        );
        err.statusCode = 409;
        throw err;
      }

      const expiryMinutes = parseInt(
        settings.reservation_expiry_minutes || process.env.RESERVATION_EXPIRY_MINUTES || '5',
        10
      );
      const reservationToken = generateSecureToken(24);
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

      // 5. Atomic conditional UPDATE
      const updateRes = await client.query(
        `UPDATE tickets
         SET status = 'RESERVED',
             seller_id = $1,
             customer_id = NULL,
             reservation_token = $2,
             reservation_expires_at = $3,
             payment_status = 'Pending',
             payment_method = NULL,
             booked_at = NULL,
             updated_at = NOW()
         WHERE id = $4 AND status = 'AVAILABLE'
         RETURNING id, ticket_number, status, seller_id, reservation_token, reservation_expires_at, ticket_price`,
        [sellerId, reservationToken, expiresAt, targetTicket.id]
      );

      if (updateRes.rows.length === 0) {
        const err = new Error(
          'This ticket has already been reserved by another seller. Please select another ticket.'
        );
        err.statusCode = 409;
        throw err;
      }

      const reservedTicket = updateRes.rows[0];

      await logActivity({
        userId: req.user.id,
        action: 'TICKET_RESERVED',
        description: `Seller ${req.user.name} (${req.user.sellerCode}) reserved ticket #${reservedTicket.ticket_number} for ${expiryMinutes} minutes`,
        client,
      });

      return {
        ticket: reservedTicket,
        expiryMinutes,
      };
    });

    const frontendBase =
      req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
    const bookingUrl = `${frontendBase}/book/${reservationResult.ticket.reservation_token}`;
    const qrCodeDataUrl = await generateQrDataUrl(bookingUrl);

    return res.status(200).json({
      success: true,
      message: `Ticket #${reservationResult.ticket.ticket_number} reserved for ${reservationResult.expiryMinutes} minutes.`,
      reservation: {
        ticketId: reservationResult.ticket.id,
        ticketNumber: reservationResult.ticket.ticket_number,
        status: reservationResult.ticket.status,
        sellerId: reservationResult.ticket.seller_id,
        reservationToken: reservationResult.ticket.reservation_token,
        reservationExpiresAt: reservationResult.ticket.reservation_expires_at,
        ticketPrice: parseFloat(reservationResult.ticket.ticket_price),
        bookingUrl,
        qrCodeDataUrl,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Could not reserve ticket.',
    });
  }
}

/**
 * GET /api/public/reservations/:reservationToken
 * Public endpoint accessed when Customer scans Seller's reservation QR code.
 */
async function getReservationByToken(req, res) {
  try {
    await releaseExpiredReservations();

    const { reservationToken } = req.params;
    const settings = await getSettingsMap();

    const ticketRes = await query(
      `SELECT t.id, t.ticket_number, t.status, t.reservation_token,
              t.reservation_expires_at, t.payment_status, t.payment_method,
              t.ticket_price, t.booked_at, t.confirmed_at,
              t.verification_token,
              s.seller_code, u.name AS seller_name,
              c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM tickets t
       LEFT JOIN sellers s ON s.id = t.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.reservation_token = $1`,
      [reservationToken]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'This reservation link has expired or is invalid. Please ask the seller for a new QR code.',
      });
    }

    const row = ticketRes.rows[0];
    const isConfirmed = row.status === 'SOLD' || row.status === 'REDEEMED';

    return res.json({
      success: true,
      event: {
        eventName: settings.event_name,
        eventSubtitle: settings.event_subtitle,
      },
      booking: {
        ticketId: row.id,
        ticketNumber: row.ticket_number,
        status: row.status,
        ticketPrice: parseFloat(row.ticket_price),
        sellerName: row.seller_name,
        sellerCode: row.seller_code,
        reservationExpiresAt: row.reservation_expires_at,
        customerSubmitted: Boolean(row.customer_name),
        customerName: row.customer_name || null,
        customerMobile: row.customer_mobile || null,
        paymentStatus: row.payment_status,
        paymentMethod: row.payment_method || null,
        bookedAt: row.booked_at,
        confirmedAt: row.confirmed_at,
        // Expose verificationToken ONLY after seller confirms payment so customer can download JPG
        verificationToken: isConfirmed ? row.verification_token : null,
      },
    });
  } catch (err) {
    console.error('getReservationByToken error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load booking details.',
    });
  }
}

/**
 * POST /api/public/reservations/:reservationToken/book
 * Customer submits Full Name and Mobile Number after scanning QR code.
 * Validates reservation and prevents duplicate customer submissions.
 */
async function submitCustomerBooking(req, res) {
  try {
    const { reservationToken } = req.params;
    const fullName = String(req.body.fullName || '').trim();
    const mobile = String(req.body.mobile || '').trim();

    const result = await withTransaction(async (client) => {
      await releaseExpiredReservations(client);

      const lockRes = await client.query(
        `SELECT t.id, t.ticket_number, t.status, t.seller_id, t.customer_id, t.reservation_expires_at
         FROM tickets t
         WHERE t.reservation_token = $1
         FOR UPDATE`,
        [reservationToken]
      );

      if (lockRes.rows.length === 0) {
        const err = new Error('Reservation expired or invalid. Please ask the seller to reserve a ticket again.');
        err.statusCode = 404;
        throw err;
      }

      const ticket = lockRes.rows[0];

      if (ticket.status !== 'RESERVED') {
        const err = new Error(
          ticket.status === 'SOLD'
            ? 'This ticket booking has already been confirmed.'
            : 'This ticket reservation is no longer active.'
        );
        err.statusCode = 409;
        throw err;
      }

      // Prevent duplicate customer submissions for the same reservation
      if (ticket.customer_id) {
        const err = new Error(
          'Customer details have already been submitted for this ticket. Please wait for the seller to confirm payment.'
        );
        err.statusCode = 409;
        throw err;
      }

      // Save customer details
      const customerInsert = await client.query(
        `INSERT INTO customers (full_name, mobile)
         VALUES ($1, $2)
         RETURNING id, full_name, mobile, created_at`,
        [fullName, mobile]
      );
      const customer = customerInsert.rows[0];

      // Extend reservation expiry by 15 minutes so seller can verify payment and confirm
      const extendedExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await client.query(
        `UPDATE tickets
         SET customer_id = $1,
             booked_at = NOW(),
             reservation_expires_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [customer.id, extendedExpiry, ticket.id]
      );

      await logActivity({
        userId: null,
        action: 'CUSTOMER_FORM_SUBMITTED',
        description: `Customer "${customer.full_name}" (${customer.mobile}) submitted booking details for ticket #${ticket.ticket_number}`,
        client,
      });

      return {
        ticketNumber: ticket.ticket_number,
        customer,
        reservationExpiresAt: extendedExpiry,
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Your details have been saved! Please complete payment with the seller to confirm and download your digital ticket.',
      data: result,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to submit booking details.',
    });
  }
}

/**
 * POST /api/seller/tickets/:ticketId/confirm-payment
 * Authenticated Seller confirms payment (Cash or UPI) and permanently confirms the ticket sale.
 * Generates verification_token for the JPG ticket and updates seller's total_tickets_sold.
 */
async function confirmTicketPayment(req, res) {
  try {
    const sellerId = req.user.sellerId;
    const ticketId = parseInt(req.params.ticketId, 10);
    const {
      paymentMethod = 'Cash',
      transactionReference = '',
      customerName = '',
      customerMobile = '',
    } = req.body;

    if (!['Cash', 'UPI'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Payment method must be either Cash or UPI.',
      });
    }

    const confirmation = await withTransaction(async (client) => {
      // Lock the ticket row
      const ticketRes = await client.query(
        `SELECT * FROM tickets WHERE id = $1 FOR UPDATE`,
        [ticketId]
      );

      if (ticketRes.rows.length === 0) {
        const err = new Error('Ticket not found.');
        err.statusCode = 404;
        throw err;
      }

      const ticket = ticketRes.rows[0];

      // Prevent duplicate confirmation
      if (ticket.status === 'SOLD' || ticket.status === 'REDEEMED') {
        const err = new Error('This ticket has already been confirmed and sold.');
        err.statusCode = 409;
        throw err;
      }

      // Verify reservation status and strict seller ownership
      if (ticket.status !== 'RESERVED' || ticket.seller_id !== sellerId) {
        const err = new Error(
          'This ticket is no longer reserved under your seller account (it may have expired or been released).'
        );
        err.statusCode = 403;
        throw err;
      }

      let customerId = ticket.customer_id;

      // If customer has not filled the QR form yet, allow seller to supply customer Name & Mobile directly
      if (!customerId) {
        const cleanName = String(customerName || '').trim();
        const cleanMobile = String(customerMobile || '').trim();

        if (!cleanName || !cleanMobile) {
          const err = new Error(
            'Customer details have not been submitted yet. Ask the customer to scan the QR code and submit their name & mobile, or enter their details here.'
          );
          err.statusCode = 400;
          throw err;
        }

        const custInsert = await client.query(
          `INSERT INTO customers (full_name, mobile)
           VALUES ($1, $2)
           RETURNING id`,
          [cleanName, cleanMobile]
        );
        customerId = custInsert.rows[0].id;
      }

      const verificationToken = generateSecureToken(24);
      const refCode =
        String(transactionReference || '').trim() ||
        `TXN-${ticket.ticket_number}-${Date.now().toString().slice(-6)}`;

      // Permanently confirm the ticket as SOLD
      const updatedTicketRes = await client.query(
        `UPDATE tickets
         SET status = 'SOLD',
             customer_id = $1,
             verification_token = $2,
             payment_status = 'Paid',
             payment_method = $3,
             booked_at = COALESCE(booked_at, NOW()),
             confirmed_at = NOW(),
             reservation_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $4 AND status = 'RESERVED' AND seller_id = $5
         RETURNING *`,
        [customerId, verificationToken, paymentMethod, ticket.id, sellerId]
      );

      if (updatedTicketRes.rows.length === 0) {
        const err = new Error('Could not confirm ticket payment due to concurrent status change.');
        err.statusCode = 409;
        throw err;
      }

      const confirmedTicket = updatedTicketRes.rows[0];

      // Record payment transaction in transactions history
      const txInsert = await client.query(
        `INSERT INTO transactions
         (ticket_id, seller_id, customer_id, amount, payment_method, payment_status, transaction_reference)
         VALUES ($1, $2, $3, $4, $5, 'Paid', $6)
         RETURNING *`,
        [
          confirmedTicket.id,
          sellerId,
          customerId,
          confirmedTicket.ticket_price,
          paymentMethod,
          refCode,
        ]
      );

      // Update seller's total_tickets_sold counter from confirmed sales
      await client.query(
        `UPDATE sellers
         SET total_tickets_sold = (
           SELECT COUNT(*)::int FROM tickets
           WHERE seller_id = $1 AND status IN ('SOLD', 'REDEEMED')
         )
         WHERE id = $1`,
        [sellerId]
      );

      const customerInfoRes = await client.query(
        `SELECT full_name, mobile FROM customers WHERE id = $1`,
        [customerId]
      );
      const customerInfo = customerInfoRes.rows[0];

      await logActivity({
        userId: req.user.id,
        action: 'TICKET_SOLD_CONFIRMED',
        description: `Seller ${req.user.name} (${req.user.sellerCode}) confirmed sale of ticket #${confirmedTicket.ticket_number} to ${customerInfo.full_name} via ${paymentMethod} (INR ${confirmedTicket.ticket_price})`,
        client,
      });

      return {
        ticket: confirmedTicket,
        customer: customerInfo,
        transaction: txInsert.rows[0],
      };
    });

    return res.status(200).json({
      success: true,
      message: `Ticket #${confirmation.ticket.ticket_number} confirmed and marked as SOLD! Digital JPG ticket is ready for download.`,
      data: {
        ticketId: confirmation.ticket.id,
        ticketNumber: confirmation.ticket.ticket_number,
        status: confirmation.ticket.status,
        verificationToken: confirmation.ticket.verification_token,
        customerName: confirmation.customer.full_name,
        customerMobile: confirmation.customer.mobile,
        paymentMethod: confirmation.ticket.payment_method,
        paymentStatus: confirmation.ticket.payment_status,
        confirmedAt: confirmation.ticket.confirmed_at,
        downloadUrl: `/api/public/tickets/${confirmation.ticket.verification_token}/download.jpg`,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Failed to confirm ticket payment.',
    });
  }
}

/**
 * POST /api/seller/tickets/:ticketId/record-pending
 * Allows a seller to log a Pending payment attempt in transaction history before final confirmation.
 */
async function recordPendingPayment(req, res) {
  try {
    const sellerId = req.user.sellerId;
    const ticketId = parseInt(req.params.ticketId, 10);
    const { paymentMethod = 'UPI', transactionReference = '' } = req.body;

    if (!['Cash', 'UPI'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Payment method must be Cash or UPI.',
      });
    }

    const result = await withTransaction(async (client) => {
      const ticketRes = await client.query(
        `SELECT * FROM tickets WHERE id = $1 AND seller_id = $2 FOR UPDATE`,
        [ticketId, sellerId]
      );

      if (ticketRes.rows.length === 0) {
        const err = new Error('Reserved ticket not found for your seller account.');
        err.statusCode = 404;
        throw err;
      }

      const ticket = ticketRes.rows[0];
      if (ticket.status !== 'RESERVED') {
        const err = new Error('Only currently reserved tickets can record a pending payment.');
        err.statusCode = 400;
        throw err;
      }

      await client.query(
        `UPDATE tickets
         SET payment_method = $1, payment_status = 'Pending', updated_at = NOW()
         WHERE id = $2`,
        [paymentMethod, ticket.id]
      );

      const txRes = await client.query(
        `INSERT INTO transactions
         (ticket_id, seller_id, customer_id, amount, payment_method, payment_status, transaction_reference)
         VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
         RETURNING *`,
        [
          ticket.id,
          sellerId,
          ticket.customer_id,
          ticket.ticket_price,
          paymentMethod,
          transactionReference || `PENDING-${ticket.ticket_number}`,
        ]
      );

      await logActivity({
        userId: req.user.id,
        action: 'PAYMENT_PENDING_LOGGED',
        description: `Seller ${req.user.name} logged a Pending ${paymentMethod} payment for ticket #${ticket.ticket_number}`,
        client,
      });

      return txRes.rows[0];
    });

    return res.json({
      success: true,
      message: 'Pending payment recorded in transaction history.',
      transaction: result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to record pending payment.',
    });
  }
}

/**
 * POST /api/seller/tickets/:ticketId/cancel-reservation
 * Seller can release their own active reservation if the customer cancels before paying.
 */
async function cancelReservation(req, res) {
  try {
    const sellerId = req.user.sellerId;
    const ticketId = parseInt(req.params.ticketId, 10);

    await withTransaction(async (client) => {
      const ticketRes = await client.query(
        `SELECT * FROM tickets WHERE id = $1 FOR UPDATE`,
        [ticketId]
      );

      if (ticketRes.rows.length === 0) {
        const err = new Error('Ticket not found.');
        err.statusCode = 404;
        throw err;
      }

      const ticket = ticketRes.rows[0];
      if (ticket.status !== 'RESERVED' || ticket.seller_id !== sellerId) {
        const err = new Error('You can only release an active reservation belonging to you.');
        err.statusCode = 403;
        throw err;
      }

      await client.query(
        `UPDATE tickets
         SET status = 'AVAILABLE',
             seller_id = NULL,
             customer_id = NULL,
             reservation_token = NULL,
             reservation_expires_at = NULL,
             payment_status = 'Pending',
             payment_method = NULL,
             booked_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [ticketId]
      );

      await logActivity({
        userId: req.user.id,
        action: 'RESERVATION_CANCELLED',
        description: `Seller ${req.user.name} released reservation on ticket #${ticket.ticket_number}`,
        client,
      });
    });

    return res.json({
      success: true,
      message: 'Reservation released. Ticket is now AVAILABLE again.',
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to cancel reservation.',
    });
  }
}

/**
 * GET /api/public/tickets/:verificationToken/download.jpg
 * Generates and downloads the JPG digital ticket using the secure verificationToken.
 */
async function downloadTicketByVerificationToken(req, res) {
  try {
    const { verificationToken } = req.params;

    const ticketRes = await query(
      `SELECT t.id, t.ticket_number, t.status, t.ticket_price, t.confirmed_at, t.verification_token,
              s.seller_code, u.name AS seller_name,
              c.full_name AS customer_name
       FROM tickets t
       LEFT JOIN sellers s ON s.id = t.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.verification_token = $1 AND t.status IN ('SOLD', 'REDEEMED')`,
      [verificationToken]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Confirmed digital ticket not found or invalid verification token.',
      });
    }

    const row = ticketRes.rows[0];
    const settings = await getSettingsMap();

    const jpgBuffer = await generateTicketJpgBuffer({
      eventName: settings.event_name,
      eventSubtitle: settings.event_subtitle,
      ticketNumber: row.ticket_number,
      customerName: row.customer_name || 'Valued Customer',
      purchaseDate: row.confirmed_at,
      sellerName: row.seller_name || 'Authorized Seller',
      sellerCode: row.seller_code || 'SLR',
      ticketPrice: row.ticket_price,
      verificationToken: row.verification_token,
      status: row.status,
    });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="LuckyDraw-Ticket-${row.ticket_number}.jpg"`
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.send(jpgBuffer);
  } catch (err) {
    console.error('downloadTicketByVerificationToken error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate JPG digital ticket.',
    });
  }
}

/**
 * GET /api/public/tickets/verify/:verificationToken
 * Public verification endpoint when scanning the QR code on a generated JPG ticket.
 * Note: Returns masked mobile number for privacy while confirming ticket authenticity.
 */
async function verifyTicketToken(req, res) {
  try {
    const { verificationToken } = req.params;
    const ticketRes = await query(
      `SELECT t.ticket_number, t.status, t.payment_status, t.confirmed_at,
              s.seller_code, u.name AS seller_name,
              c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM tickets t
       LEFT JOIN sellers s ON s.id = t.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.verification_token = $1 AND t.status IN ('SOLD', 'REDEEMED')`,
      [verificationToken]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        authentic: false,
        message: 'INVALID TICKET: No confirmed ticket matches this verification token.',
      });
    }

    const row = ticketRes.rows[0];
    const rawMobile = String(row.customer_mobile || '');
    const maskedMobile =
      rawMobile.length >= 4
        ? `${'*'.repeat(Math.max(0, rawMobile.length - 4))}${rawMobile.slice(-4)}`
        : '****';

    return res.json({
      success: true,
      authentic: true,
      message: 'AUTHENTIC DIGITAL TICKET VERIFIED',
      ticket: {
        ticketNumber: row.ticket_number,
        status: row.status,
        paymentStatus: row.payment_status,
        customerName: row.customer_name,
        maskedMobile,
        sellerName: row.seller_name,
        sellerCode: row.seller_code,
        confirmedAt: row.confirmed_at,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Verification check failed.',
    });
  }
}

module.exports = {
  listTickets,
  reserveTicket,
  getReservationByToken,
  submitCustomerBooking,
  confirmTicketPayment,
  recordPendingPayment,
  cancelReservation,
  downloadTicketByVerificationToken,
  verifyTicketToken,
  getSettingsMap,
};

