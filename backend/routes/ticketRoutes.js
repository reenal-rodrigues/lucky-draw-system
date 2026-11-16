const express = require('express');
const { body } = require('express-validator');
const { listTickets, reserveTicket } = require('../controllers/bookingController');
const { requireAuth, requireSeller } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

// Authenticated users (Admin or Seller) can view ticket grid
router.get('/', requireAuth, listTickets);

// Only authenticated Sellers can reserve an available ticket
router.post(
  '/reserve',
  requireAuth,
  requireSeller,
  [
    body('ticketNumber')
      .trim()
      .notEmpty()
      .withMessage('Ticket number is required.'),
    handleValidationErrors,
  ],
  reserveTicket
);

module.exports = router;

