const { query } = require('../config/db');

/**
 * Releases any RESERVED tickets whose reservation_expires_at timestamp has passed
 * without payment confirmation.
 * Can run using a transaction client or the default pool.
 */
async function releaseExpiredReservations(client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `UPDATE tickets
     SET status = 'AVAILABLE',
         seller_id = NULL,
         customer_id = NULL,
         reservation_token = NULL,
         reservation_expires_at = NULL,
         booked_at = NULL,
         payment_status = 'Pending',
         payment_method = NULL,
         updated_at = NOW()
     WHERE status = 'RESERVED'
       AND reservation_expires_at IS NOT NULL
       AND reservation_expires_at < NOW()
     RETURNING id, ticket_number`
  );
  return result.rows;
}

module.exports = { releaseExpiredReservations };

