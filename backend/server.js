const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initializeDatabase } = require('./database/initDb');
const { releaseExpiredReservations } = require('./services/reservationCleaner');

const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const publicRoutes = require('./routes/publicRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// CORS configuration
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate Limiting for security
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again shortly.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please wait a few minutes.',
  },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'Digital Lucky Draw Ticket Management API',
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/admin', adminRoutes);

// 404 Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

let cleanerInterval = null;

async function startServer(port = process.env.PORT || 5000) {
  await initializeDatabase({ seedDefaults: true });

  // Periodically release expired reservations every 20 seconds
  cleanerInterval = setInterval(async () => {
    try {
      await releaseExpiredReservations();
    } catch (e) {
      console.error('Reservation cleaner error:', e.message);
    }
  }, 20000);
  if (cleanerInterval.unref) cleanerInterval.unref();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`=============================================================`);
      console.log(` Lucky Draw Backend API running on http://localhost:${port}`);
      console.log(`=============================================================`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };

