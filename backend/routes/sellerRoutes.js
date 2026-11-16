const express = require('express');
const { body, param } = require('express-validator');
const { getSellerDashboard } = require('../controllers/sellerController');
const {
  confirmTicketPayment,
  recordPendingPayment,
  cancelReservation,
} = require('../controllers/bookingController');
const { requireAuth, requireSeller } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

// Protect all seller routes
router.use(requireAuth, requireSeller);

router.get('/dashboard', getSellerDashboard);

router.post(
  '/tickets/:ticketId/confirm-payment',
  [
    param('ticketId').isInt({ min: 1 }).withMessage('Valid ticket ID is required.'),
    body('paymentMethod')
      .isIn(['Cash', 'UPI'])
      .withMessage('Payment method must be Cash or UPI.'),
    handleValidationErrors,
  ],
  confirmTicketPayment
);

router.post(
  '/tickets/:ticketId/record-pending',
  [
    param('ticketId').isInt({ min: 1 }).withMessage('Valid ticket ID is required.'),
    body('paymentMethod')
      .isIn(['Cash', 'UPI'])
      .withMessage('Payment method must be Cash or UPI.'),
    handleValidationErrors,
  ],
  recordPendingPayment
);

router.post(
  '/tickets/:ticketId/cancel-reservation',
  [
    param('ticketId').isInt({ min: 1 }).withMessage('Valid ticket ID is required.'),
    handleValidationErrors,
  ],
  cancelReservation
);

module.exports = router;

