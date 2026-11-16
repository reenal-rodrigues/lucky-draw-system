const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'lucky_draw_secure_jwt_secret_key_2026_production_ready';

/**
 * Verifies JWT token and loads active user + seller profile from PostgreSQL.
 */
async function requireAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && req.query.token) {
      // Allow token in query string for direct file downloads (JPG ticket / Excel export)
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const userRes = await query(
      `SELECT u.id, u.name, u.username, u.role, u.mobile, u.is_active,
              s.id AS seller_id, s.seller_code, s.total_tickets_sold
       FROM users u
       LEFT JOIN sellers s ON s.user_id = u.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists.',
      });
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated by the administrator.',
      });
    }

    req.user = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      mobile: user.mobile,
      isActive: user.is_active,
      sellerId: user.seller_id || null,
      sellerCode: user.seller_code || null,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token. Please log in again.',
    });
  }
}

/**
 * Ensures the authenticated user is an ADMIN.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrator privileges required.',
    });
  }
  next();
}

/**
 * Ensures the authenticated user is a SELLER with a valid seller profile.
 */
function requireSeller(req, res, next) {
  if (!req.user || req.user.role !== 'SELLER' || !req.user.sellerId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Authorized seller account required.',
    });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSeller,
  JWT_SECRET,
};

