const express = require('express');
const { body, param } = require('express-validator');
const {
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
} = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

// Protect all admin routes with JWT + ADMIN role authorization
router.use(requireAuth, requireAdmin);

router.get('/dashboard', getAdminDashboard);

// Seller management
router.get('/sellers/:sellerId/sales', getSellerSalesDetail);
router.post(
  '/sellers',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Seller name is required.'),
    body('username')
      .trim()
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters.'),
    body('password')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters.'),
    handleValidationErrors,
  ],
  createSeller
);
router.post('/sellers/ensure-50', ensureFiftySellers);
router.put(
  '/sellers/:sellerId',
  [
    param('sellerId').isInt({ min: 1 }).withMessage('Valid seller ID is required.'),
    handleValidationErrors,
  ],
  updateSeller
);
router.patch(
  '/sellers/:sellerId/status',
  [
    param('sellerId').isInt({ min: 1 }).withMessage('Valid seller ID is required.'),
    body('isActive').isBoolean().withMessage('isActive boolean is required.'),
    handleValidationErrors,
  ],
  toggleSellerStatus
);
router.post(
  '/sellers/:sellerId/reset-password',
  [
    param('sellerId').isInt({ min: 1 }).withMessage('Valid seller ID is required.'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters.'),
    handleValidationErrors,
  ],
  resetSellerPassword
);

// Ticket & System settings
router.post('/tickets/configure', configureTicketsAndSettings);
router.patch(
  '/tickets/:ticketId/status',
  [
    param('ticketId').isInt({ min: 1 }).withMessage('Valid ticket ID is required.'),
    body('status')
      .isIn(['AVAILABLE', 'SOLD', 'REDEEMED'])
      .withMessage('Status must be AVAILABLE, SOLD, or REDEEMED.'),
    handleValidationErrors,
  ],
  updateTicketStatusByAdmin
);

// Customers, Transactions, Settlements, Logs & Export
router.get('/customers', listCustomers);
router.get('/transactions', listTransactions);
router.get('/settlements', listSettlements);
router.post(
  '/settlements',
  [
    body('sellerId').isInt({ min: 1 }).withMessage('Seller ID is required.'),
    body('amount')
      .isFloat({ gt: 0 })
      .withMessage('Settlement amount must be greater than 0.'),
    handleValidationErrors,
  ],
  createSettlement
);
router.get('/activity-logs', listActivityLogs);
router.get('/reports/export', exportReport);

module.exports = router;

