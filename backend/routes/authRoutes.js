const express = require('express');
const { body } = require('express-validator');
const { login, getMe } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
    handleValidationErrors,
  ],
  login
);

router.get('/me', requireAuth, getMe);

module.exports = router;

