const express = require('express');
const { body, param } = require('express-validator');
const {
  getReservationByToken,
  submitCustomerBooking,
  downloadTicketByVerificationToken,
  verifyTicketToken,
} = require('../controllers/bookingController');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

// Customer scans QR code -> loads booking reservation status
router.get(
  '/reservations/:reservationToken',
  [
    param('reservationToken')
      .trim()
      .isLength({ min: 16, max: 128 })
      .withMessage('Invalid reservation token format.'),
    handleValidationErrors,
  ],
  getReservationByToken
);

// Customer submits Full Name and Mobile Number (no account required)
router.post(
  '/reservations/:reservationToken/book',
  [
    param('reservationToken')
      .trim()
      .isLength({ min: 16, max: 128 })
      .withMessage('Invalid reservation token format.'),
    body('fullName')
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage('Please enter your full name (at least 2 characters).'),
    body('mobile')
      .trim()
      .matches(/^[0-9+\-\s]{10,15}$/)
      .withMessage('Please enter a valid 10-digit mobile number.'),
    handleValidationErrors,
  ],
  submitCustomerBooking
);

// Customer or Seller downloads confirmed JPG digital ticket
router.get(
  '/tickets/:verificationToken/download.jpg',
  [
    param('verificationToken')
      .trim()
      .isLength({ min: 16, max: 128 })
      .withMessage('Invalid ticket verification token.'),
    handleValidationErrors,
  ],
  downloadTicketByVerificationToken
);

// Public QR verification endpoint for checking ticket authenticity
router.get(
  '/tickets/verify/:verificationToken',
  [
    param('verificationToken')
      .trim()
      .isLength({ min: 16, max: 128 })
      .withMessage('Invalid verification token.'),
    handleValidationErrors,
  ],
  verifyTicketToken
);

module.exports = router;

