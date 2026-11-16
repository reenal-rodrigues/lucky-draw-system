-- ============================================================================
-- Digital Lucky Draw Ticket Management System - PostgreSQL Schema
-- Compatible with Supabase PostgreSQL & Standard PostgreSQL 14+
-- ============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'SELLER')),
    mobile VARCHAR(25),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SELLERS TABLE
CREATE TABLE IF NOT EXISTS sellers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    seller_code VARCHAR(30) UNIQUE NOT NULL,
    total_tickets_sold INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    mobile VARCHAR(25) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TICKETS TABLE
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'REDEEMED')),
    seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    reservation_token VARCHAR(128) UNIQUE,
    reservation_expires_at TIMESTAMPTZ,
    verification_token VARCHAR(128) UNIQUE,
    payment_status VARCHAR(20) DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Refunded')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('Cash', 'UPI') OR payment_method IS NULL),
    ticket_price NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    booked_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('Cash', 'UPI')),
    payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('Pending', 'Paid', 'Refunded')),
    transaction_reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SETTLEMENTS TABLE
CREATE TABLE IF NOT EXISTS settlements (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    settlement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_reference VARCHAR(100),
    notes TEXT
);

-- 7. ACTIVITY LOGS TABLE
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. SYSTEM SETTINGS TABLE (Event config, ticket price, reservation expiry, sales status)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(60) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE & SEARCH
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_sellers_user_id ON sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_code ON sellers(seller_code);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_seller_id ON tickets(seller_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_reservation_token ON tickets(reservation_token);
CREATE INDEX IF NOT EXISTS idx_tickets_verification_token ON tickets(verification_token);
CREATE INDEX IF NOT EXISTS idx_tickets_expires_at ON tickets(reservation_expires_at);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ticket_id ON transactions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_settlements_seller_id ON settlements(seller_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Default System Settings
INSERT INTO system_settings (key, value) VALUES
    ('event_name', 'GRAND DIGITAL LUCKY DRAW 2026'),
    ('event_subtitle', 'Official Authorized Digital Raffle Ticket'),
    ('ticket_price', '50'),
    ('reservation_expiry_minutes', '5'),
    ('sales_enabled', 'true'),
    ('legal_compliance_mode', 'DEMO_AUTHORIZED')
ON CONFLICT (key) DO NOTHING;

