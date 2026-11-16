const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');
const { logActivity } = require('../services/activityLogger');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

async function login(req, res) {
  try {
    const { username, password } = req.body;

    const userRes = await query(
      `SELECT u.id, u.name, u.username, u.password_hash, u.role, u.mobile, u.is_active,
              s.id AS seller_id, s.seller_code, s.total_tickets_sold
       FROM users u
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [String(username || '').trim()]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is currently deactivated. Please contact the administrator.',
      });
    }

    const isPasswordValid = await bcrypt.compare(String(password || ''), user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        sellerId: user.seller_id || null,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await logActivity({
      userId: user.id,
      action: 'USER_LOGIN',
      description: `${user.role} "${user.name}" (${user.username}) logged in`,
    });

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        mobile: user.mobile,
        isActive: user.is_active,
        sellerId: user.seller_id || null,
        sellerCode: user.seller_code || null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login.',
    });
  }
}

async function getMe(req, res) {
  return res.json({
    success: true,
    user: req.user,
  });
}

module.exports = {
  login,
  getMe,
};

