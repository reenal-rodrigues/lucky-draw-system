const assert = require('assert');
// Use in-memory PostgreSQL instance for isolated, repeatable automated testing
process.env.DATABASE_URL = 'memory';

const { startServer } = require('../server');
const { pool, query } = require('../config/db');

async function apiRequest(baseUrl, path, { method = 'GET', token = null, body = null } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    return { status: res.status, headers: res.headers, data };
  } else {
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, buffer };
  }
}

async function runTests() {
  console.log('=============================================================');
  console.log(' RUNNING FULL-STACK BACKEND & CONCURRENCY VERIFICATION SUITE');
  console.log('=============================================================\n');

  const server = await startServer(0); // ephemeral port
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Admin Login
    console.log('[TEST 1] Admin Login...');
    const adminLogin = await apiRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Admin@123' },
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login should return 200');
    assert.strictEqual(adminLogin.data.user.role, 'ADMIN');
    const adminToken = adminLogin.data.token;
    console.log('  -> PASS: Admin logged in successfully.');

    // 2. Seller Login (Seller A: Reenal / seller01, Seller B: seller02)
    console.log('[TEST 2] Seller A (seller01) & Seller B (seller02) Login...');
    const sellerALogin = await apiRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'seller01', password: 'Seller@123' },
    });
    const sellerBLogin = await apiRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'seller02', password: 'Seller@123' },
    });
    assert.strictEqual(sellerALogin.status, 200);
    assert.strictEqual(sellerBLogin.status, 200);
    const sellerAToken = sellerALogin.data.token;
    const sellerBToken = sellerBLogin.data.token;
    console.log('  -> PASS: Seller A (Reenal) and Seller B (Seller 02) logged in.');

    // 3. Verify 50 Seller Accounts exist & Admin can create additional or ensure 50 sellers
    console.log('[TEST 3] Verify 50 Authorized Seller Accounts...');
    const ensure50Res = await apiRequest(baseUrl, '/api/admin/sellers/ensure-50', {
      method: 'POST',
      token: adminToken,
      body: {},
    });
    assert.strictEqual(ensure50Res.status, 200);
    const dashInitial = await apiRequest(baseUrl, '/api/admin/dashboard', {
      token: adminToken,
    });
    assert.strictEqual(dashInitial.data.summary.totalSellers, 50);
    console.log('  -> PASS: 50 authorized seller accounts verified.');

    // 4. Seller cannot access Admin routes
    console.log('[TEST 4] Role-based Authorization (Seller blocked from Admin API)...');
    const unauthorizedAdminCall = await apiRequest(baseUrl, '/api/admin/dashboard', {
      token: sellerAToken,
    });
    assert.strictEqual(unauthorizedAdminCall.status, 403);
    console.log('  -> PASS: Seller blocked from Admin routes with HTTP 403.');

    // 5. CRITICAL TEST: Simultaneous Booking Requests for Ticket #001
    console.log('[TEST 5] CRITICAL CONCURRENCY TEST: Seller A and Seller B simultaneously reserve Ticket #001...');
    const [resA, resB] = await Promise.all([
      apiRequest(baseUrl, '/api/tickets/reserve', {
        method: 'POST',
        token: sellerAToken,
        body: { ticketNumber: '001' },
      }),
      apiRequest(baseUrl, '/api/tickets/reserve', {
        method: 'POST',
        token: sellerBToken,
        body: { ticketNumber: '001' },
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepStrictEqual(
      statuses,
      [200, 409],
      `Expected one 200 OK and one 409 Conflict, got ${statuses.join(', ')}`
    );

    const winner = resA.status === 200 ? resA : resB;
    const loser = resA.status === 409 ? resA : resB;
    const winningSellerToken = resA.status === 200 ? sellerAToken : sellerBToken;

    assert.strictEqual(
      loser.data.message,
      'This ticket has already been reserved by another seller. Please select another ticket.'
    );
    console.log(`  -> PASS: Exactly ONE seller reserved Ticket #001 (HTTP 200).`);
    console.log(`  -> PASS: Second seller received HTTP 409: "${loser.data.message}"`);

    // 6. Customer scans QR code & submits booking details
    console.log('[TEST 6] Customer scans QR reservation token & submits Full Name and Mobile...');
    const reservationToken = winner.data.reservation.reservationToken;
    const ticketId = winner.data.reservation.ticketId;

    const scanRes = await apiRequest(baseUrl, `/api/public/reservations/${reservationToken}`);
    assert.strictEqual(scanRes.status, 200);
    assert.strictEqual(scanRes.data.booking.ticketNumber, '001');

    const bookRes = await apiRequest(
      baseUrl,
      `/api/public/reservations/${reservationToken}/book`,
      {
        method: 'POST',
        body: { fullName: 'Aarav Sharma', mobile: '9876543210' },
      }
    );
    assert.strictEqual(bookRes.status, 200);

    // Verify duplicate customer submission is rejected
    const duplicateBookRes = await apiRequest(
      baseUrl,
      `/api/public/reservations/${reservationToken}/book`,
      {
        method: 'POST',
        body: { fullName: 'Duplicate Person', mobile: '9111111111' },
      }
    );
    assert.strictEqual(duplicateBookRes.status, 409);
    console.log('  -> PASS: Customer booking saved & duplicate customer submission blocked (HTTP 409).');

    // 7. Seller confirms payment & prevents duplicate confirmation
    console.log('[TEST 7] Seller confirms payment (UPI) & permanently confirms Ticket #001...');
    const confirmRes = await apiRequest(
      baseUrl,
      `/api/seller/tickets/${ticketId}/confirm-payment`,
      {
        method: 'POST',
        token: winningSellerToken,
        body: { paymentMethod: 'UPI', transactionReference: 'UPI-99887766' },
      }
    );
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.data.data.status, 'SOLD');
    const verificationToken = confirmRes.data.data.verificationToken;
    assert.ok(verificationToken && verificationToken.length >= 32);

    // Attempt duplicate confirmation
    const dupConfirmRes = await apiRequest(
      baseUrl,
      `/api/seller/tickets/${ticketId}/confirm-payment`,
      {
        method: 'POST',
        token: winningSellerToken,
        body: { paymentMethod: 'Cash' },
      }
    );
    assert.strictEqual(dupConfirmRes.status, 409);
    console.log('  -> PASS: Payment confirmed, ticket marked SOLD, duplicate confirmation blocked (HTTP 409).');

    // 8. Customer downloads generated JPG Digital Ticket
    console.log('[TEST 8] Download JPG Digital Ticket & Verify QR Token...');
    const jpgDownload = await apiRequest(
      baseUrl,
      `/api/public/tickets/${verificationToken}/download.jpg`
    );
    assert.strictEqual(jpgDownload.status, 200);
    assert.ok(
      jpgDownload.headers.get('content-type').includes('image/jpeg'),
      'Content-Type must be image/jpeg'
    );
    // Check JPEG magic bytes (FF D8 FF)
    assert.strictEqual(jpgDownload.buffer[0], 0xff);
    assert.strictEqual(jpgDownload.buffer[1], 0xd8);
    assert.strictEqual(jpgDownload.buffer[2], 0xff);
    assert.ok(jpgDownload.buffer.length > 10000, 'JPG buffer should be a rich image');
    console.log(`  -> PASS: Valid JPG digital ticket generated (${jpgDownload.buffer.length} bytes).`);

    // 9. Expired Reservation Automatic Release Test
    console.log('[TEST 9] Expired Reservation Automatic Release...');
    const resTicket2 = await apiRequest(baseUrl, '/api/tickets/reserve', {
      method: 'POST',
      token: sellerBToken,
      body: { ticketNumber: '002' },
    });
    assert.strictEqual(resTicket2.status, 200);

    // Simulate expiry in PostgreSQL by setting reservation_expires_at to 1 minute in the past
    await query(
      `UPDATE tickets SET reservation_expires_at = NOW() - INTERVAL '1 minute' WHERE ticket_number = '002'`
    );

    // Now Seller A tries to reserve Ticket #002 - should succeed because expired reservation is released!
    const resTicket2AfterExpiry = await apiRequest(baseUrl, '/api/tickets/reserve', {
      method: 'POST',
      token: sellerAToken,
      body: { ticketNumber: '002' },
    });
    assert.strictEqual(resTicket2AfterExpiry.status, 200);
    console.log('  -> PASS: Expired reservation on Ticket #002 automatically released and re-reserved.');

    // 10. Admin Dashboard Accuracy & Excel/CSV Report Export
    console.log('[TEST 10] Admin Dashboard Seller-Wise Tracking & Excel/CSV Export...');
    const adminDashAfter = await apiRequest(baseUrl, '/api/admin/dashboard', {
      token: adminToken,
    });
    assert.strictEqual(adminDashAfter.status, 200);
    assert.strictEqual(adminDashAfter.data.summary.ticketsSold, 1);
    assert.strictEqual(adminDashAfter.data.summary.totalCollection, 50);

    const exportCsv = await apiRequest(
      baseUrl,
      '/api/admin/reports/export?type=sales&format=csv',
      { token: adminToken }
    );
    assert.strictEqual(exportCsv.status, 200);
    assert.ok(exportCsv.buffer.toString('utf8').includes('Aarav Sharma'));

    const exportXlsx = await apiRequest(
      baseUrl,
      '/api/admin/reports/export?type=sellers&format=xlsx',
      { token: adminToken }
    );
    assert.strictEqual(exportXlsx.status, 200);
    assert.ok(exportXlsx.buffer.length > 1000);
    console.log('  -> PASS: Admin statistics, seller-wise tracking, CSV export, and XLSX export verified.');

    console.log('\n=============================================================');
    console.log(' ALL 10 TEST SUITES PASSED SUCCESSFULLY!');
    console.log('=============================================================');
  } finally {
    server.close();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});

