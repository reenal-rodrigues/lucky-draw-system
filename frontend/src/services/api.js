const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function getToken() {
  return sessionStorage.getItem('lucky_draw_jwt') || localStorage.getItem('lucky_draw_jwt');
}

export function setAuthSession(token, user) {
  localStorage.setItem('lucky_draw_jwt', token);
  localStorage.setItem('lucky_draw_user', JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem('lucky_draw_jwt');
  localStorage.removeItem('lucky_draw_user');
  sessionStorage.removeItem('lucky_draw_jwt');
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('lucky_draw_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function request(endpoint, { method = 'GET', body = null, auth = true } = {}) {
  const headers = {};
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Unexpected server response.',
  }));

  if (!response.ok || !data.success) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    }),
  getMe: () => request('/api/auth/me'),

  // Tickets (Shared by Admin & Seller)
  getTickets: ({ status = '', search = '' } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request(`/api/tickets${qs ? `?${qs}` : ''}`);
  },
  reserveTicket: (ticketNumber) =>
    request('/api/tickets/reserve', {
      method: 'POST',
      body: { ticketNumber },
    }),

  // Seller Endpoints
  getSellerDashboard: () => request('/api/seller/dashboard'),
  confirmTicketPayment: (ticketId, payload) =>
    request(`/api/seller/tickets/${ticketId}/confirm-payment`, {
      method: 'POST',
      body: payload,
    }),
  recordPendingPayment: (ticketId, payload) =>
    request(`/api/seller/tickets/${ticketId}/record-pending`, {
      method: 'POST',
      body: payload,
    }),
  cancelReservation: (ticketId) =>
    request(`/api/seller/tickets/${ticketId}/cancel-reservation`, {
      method: 'POST',
    }),

  // Public Customer QR Booking & Ticket Download/Verification
  getPublicReservation: (reservationToken) =>
    request(`/api/public/reservations/${reservationToken}`, { auth: false }),
  submitCustomerBooking: (reservationToken, payload) =>
    request(`/api/public/reservations/${reservationToken}/book`, {
      method: 'POST',
      body: payload,
      auth: false,
    }),
  verifyTicketToken: (verificationToken) =>
    request(`/api/public/tickets/verify/${verificationToken}`, { auth: false }),
  getTicketJpgDownloadUrl: (verificationToken) =>
    `${API_BASE}/api/public/tickets/${verificationToken}/download.jpg`,

  // Admin Endpoints
  getAdminDashboard: () => request('/api/admin/dashboard'),
  getSellerSalesDetail: (sellerId) => request(`/api/admin/sellers/${sellerId}/sales`),
  createSeller: (payload) =>
    request('/api/admin/sellers', {
      method: 'POST',
      body: payload,
    }),
  ensureFiftySellers: (defaultPassword = 'Seller@123') =>
    request('/api/admin/sellers/ensure-50', {
      method: 'POST',
      body: { defaultPassword },
    }),
  updateSeller: (sellerId, payload) =>
    request(`/api/admin/sellers/${sellerId}`, {
      method: 'PUT',
      body: payload,
    }),
  toggleSellerStatus: (sellerId, isActive) =>
    request(`/api/admin/sellers/${sellerId}/status`, {
      method: 'PATCH',
      body: { isActive },
    }),
  resetSellerPassword: (sellerId, newPassword) =>
    request(`/api/admin/sellers/${sellerId}/reset-password`, {
      method: 'POST',
      body: { newPassword },
    }),
  configureSystemAndTickets: (payload) =>
    request('/api/admin/tickets/configure', {
      method: 'POST',
      body: payload,
    }),
  updateTicketStatusByAdmin: (ticketId, status) =>
    request(`/api/admin/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: { status },
    }),
  getCustomers: (search = '') =>
    request(`/api/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getTransactions: ({ paymentMethod = '', paymentStatus = '', sellerId = '' } = {}) => {
    const params = new URLSearchParams();
    if (paymentMethod) params.set('paymentMethod', paymentMethod);
    if (paymentStatus) params.set('paymentStatus', paymentStatus);
    if (sellerId) params.set('sellerId', sellerId);
    const qs = params.toString();
    return request(`/api/admin/transactions${qs ? `?${qs}` : ''}`);
  },
  getSettlements: () => request('/api/admin/settlements'),
  createSettlement: (payload) =>
    request('/api/admin/settlements', {
      method: 'POST',
      body: payload,
    }),
  getActivityLogs: () => request('/api/admin/activity-logs'),
  getReportExportUrl: (type = 'sales', format = 'xlsx') => {
    const token = getToken();
    return `${API_BASE}/api/admin/reports/export?type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}&token=${encodeURIComponent(token || '')}`;
  },
};

