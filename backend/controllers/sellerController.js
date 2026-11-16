const { query } = require('../config/db');
const { releaseExpiredReservations } = require('../services/reservationCleaner');
const { generateQrDataUrl } = require('../services/ticketGeneratorService');

/**
 * GET /api/seller/dashboard
 * Returns authenticated seller's personal stats, active reservations, confirmed sales,
 * transactions, and settlements.
 */
async function getSellerDashboard(req, res) {
  try {
    await releaseExpiredReservations();

    const sellerId = req.user.sellerId;
    const frontendBase =
      req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';

    // 1. Confirmed tickets sold count & collection stats
    const salesStatsRes = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('SOLD', 'REDEEMED'))::int AS tickets_sold,
         COUNT(*) FILTER (WHERE status = 'RESERVED')::int AS active_reservations,
         COALESCE(SUM(ticket_price) FILTER (WHERE status IN ('SOLD', 'REDEEMED') AND payment_status = 'Paid'), 0)::numeric(10,2) AS total_collected,
         COALESCE(SUM(ticket_price) FILTER (WHERE status = 'RESERVED'), 0)::numeric(10,2) AS pending_amount
       FROM tickets
       WHERE seller_id = $1`,
      [sellerId]
    );

    const paymentBreakdownRes = await query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Paid' AND payment_method = 'Cash'), 0)::numeric(10,2) AS cash_collected,
         COALESCE(SUM(amount) FILTER (WHERE payment_status = 'Paid' AND payment_method = 'UPI'), 0)::numeric(10,2) AS upi_collected
       FROM transactions
       WHERE seller_id = $1`,
      [sellerId]
    );

    const settlementRes = await query(
      `SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_submitted
       FROM settlements
       WHERE seller_id = $1`,
      [sellerId]
    );

    const statsRow = salesStatsRes.rows[0];
    const payRow = paymentBreakdownRes.rows[0];
    const totalCollected = parseFloat(statsRow.total_collected || '0');
    const totalSubmitted = parseFloat(settlementRes.rows[0].total_submitted || '0');
    const outstandingBalance = Math.max(0, totalCollected - totalSubmitted);

    // 2. Active Reservations for this seller (with QR code for customer scanning & payment confirmation)
    const activeReservationsRes = await query(
      `SELECT t.id, t.ticket_number, t.status, t.reservation_token, t.reservation_expires_at,
              t.payment_status, t.payment_method, t.ticket_price, t.booked_at,
              c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.seller_id = $1 AND t.status = 'RESERVED'
       ORDER BY t.updated_at DESC`,
      [sellerId]
    );

    const activeReservations = await Promise.all(
      activeReservationsRes.rows.map(async (r) => {
        const bookingUrl = `${frontendBase}/book/${r.reservation_token}`;
        const qrCodeDataUrl = await generateQrDataUrl(bookingUrl);
        return {
          ...r,
          ticket_price: parseFloat(r.ticket_price),
          bookingUrl,
          qrCodeDataUrl,
        };
      })
    );

    // 3. Confirmed Ticket Sales by this seller
    const confirmedSalesRes = await query(
      `SELECT t.id, t.ticket_number, t.status, t.payment_status, t.payment_method,
              t.ticket_price, t.booked_at, t.confirmed_at, t.verification_token,
              c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE t.seller_id = $1 AND t.status IN ('SOLD', 'REDEEMED')
       ORDER BY t.confirmed_at DESC NULLS LAST, CAST(t.ticket_number AS INTEGER) ASC`,
      [sellerId]
    );

    // 4. Seller's Transaction History
    const transactionsRes = await query(
      `SELECT tx.id, tx.ticket_id, tk.ticket_number, tx.amount, tx.payment_method,
              tx.payment_status, tx.transaction_reference, tx.created_at,
              c.full_name AS customer_name, c.mobile AS customer_mobile
       FROM transactions tx
       JOIN tickets tk ON tk.id = tx.ticket_id
       LEFT JOIN customers c ON c.id = tx.customer_id
       WHERE tx.seller_id = $1
       ORDER BY tx.created_at DESC`,
      [sellerId]
    );

    // 5. Seller's Settlement History with Admin
    const settlementsListRes = await query(
      `SELECT id, amount, settlement_date, payment_reference, notes
       FROM settlements
       WHERE seller_id = $1
       ORDER BY settlement_date DESC`,
      [sellerId]
    );

    return res.json({
      success: true,
      seller: {
        id: req.user.sellerId,
        userId: req.user.id,
        name: req.user.name,
        username: req.user.username,
        sellerCode: req.user.sellerCode,
        mobile: req.user.mobile,
      },
      stats: {
        ticketsSold: statsRow.tickets_sold,
        activeReservations: statsRow.active_reservations,
        totalCollected,
        cashCollected: parseFloat(payRow.cash_collected || '0'),
        upiCollected: parseFloat(payRow.upi_collected || '0'),
        pendingAmount: parseFloat(statsRow.pending_amount || '0'),
        moneySubmittedToAdmin: totalSubmitted,
        outstandingBalance,
      },
      activeReservations,
      sales: confirmedSalesRes.rows.map((s) => ({
        ...s,
        ticket_price: parseFloat(s.ticket_price),
        downloadUrl: s.verification_token
          ? `/api/public/tickets/${s.verification_token}/download.jpg`
          : null,
      })),
      transactions: transactionsRes.rows.map((t) => ({
        ...t,
        amount: parseFloat(t.amount),
      })),
      settlements: settlementsListRes.rows.map((st) => ({
        ...st,
        amount: parseFloat(st.amount),
      })),
    });
  } catch (err) {
    console.error('getSellerDashboard error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to load seller dashboard.',
    });
  }
}

module.exports = {
  getSellerDashboard,
};

