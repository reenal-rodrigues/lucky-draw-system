import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Ticket,
  CheckCircle2,
  Clock,
  IndianRupee,
  Download,
  RefreshCw,
  Search,
  Settings,
  UserPlus,
  KeyRound,
  Edit3,
  Power,
  Wallet,
  Activity,
  Eye,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import TicketGrid from '../components/TicketGrid';
import DigitalTicketCard from '../components/DigitalTicketCard';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [ticketsState, setTicketsState] = useState({ tickets: [], summary: {} });
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [txFilterMethod, setTxFilterMethod] = useState('');
  const [txFilterStatus, setTxFilterStatus] = useState('');
  const [settlements, setSettlements] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [sellerSearch, setSellerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Modals State
  const [selectedSellerDetail, setSelectedSellerDetail] = useState(null);
  const [showCreateSellerModal, setShowCreateSellerModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState(null);
  const [resetPasswordSeller, setResetPasswordSeller] = useState(null);
  const [settlementSeller, setSettlementSeller] = useState(null);
  const [adminInspectTicket, setAdminInspectTicket] = useState(null);

  // Forms State
  const [newSellerForm, setNewSellerForm] = useState({
    name: '',
    username: '',
    password: 'Seller@123',
    mobile: '',
    sellerCode: '',
  });
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [settlementForm, setSettlementForm] = useState({
    sellerId: '',
    amount: '',
    paymentReference: '',
    notes: '',
  });
  const [configForm, setConfigForm] = useState({
    eventName: 'GRAND DIGITAL LUCKY DRAW 2026',
    eventSubtitle: 'Official Authorized Digital Raffle Ticket',
    totalTickets: 200,
    ticketPrice: 50,
    reservationExpiryMinutes: 5,
    salesEnabled: true,
  });

  const showNotice = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev.text === text ? { type: '', text: '' } : prev));
    }, 5000);
  };

  const loadAdminOverview = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, tkRes] = await Promise.all([
        api.getAdminDashboard(),
        api.getTickets(),
      ]);
      setDashboard(dashRes);
      setTicketsState({
        tickets: tkRes.tickets || [],
        summary: tkRes.summary || {},
      });
      if (dashRes.settings) {
        setConfigForm({
          eventName: dashRes.settings.eventName || 'GRAND DIGITAL LUCKY DRAW 2026',
          eventSubtitle:
            dashRes.settings.eventSubtitle || 'Official Authorized Digital Raffle Ticket',
          totalTickets: dashRes.summary?.totalTickets || 200,
          ticketPrice: dashRes.settings.ticketPrice || 50,
          reservationExpiryMinutes: dashRes.settings.reservationExpiryMinutes || 5,
          salesEnabled: dashRes.settings.salesEnabled ?? true,
        });
      }
    } catch (err) {
      showNotice('error', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminOverview();
  }, [loadAdminOverview]);

  useEffect(() => {
    if (activeTab === 'customers') {
      api
        .getCustomers(customerSearch)
        .then((res) => setCustomers(res.customers || []))
        .catch((err) => showNotice('error', err.message));
    } else if (activeTab === 'finance') {
      Promise.all([
        api.getTransactions({
          paymentMethod: txFilterMethod,
          paymentStatus: txFilterStatus,
        }),
        api.getSettlements(),
      ])
        .then(([txRes, stRes]) => {
          setTransactions(txRes.transactions || []);
          setSettlements(stRes.settlements || []);
        })
        .catch((err) => showNotice('error', err.message));
    } else if (activeTab === 'logs') {
      api
        .getActivityLogs()
        .then((res) => setActivityLogs(res.logs || []))
        .catch((err) => showNotice('error', err.message));
    }
  }, [activeTab, customerSearch, txFilterMethod, txFilterStatus]);

  // Drill-down into a specific Seller's sales (e.g., clicking "Reenal")
  const handleOpenSellerSales = async (sellerId) => {
    try {
      const res = await api.getSellerSalesDetail(sellerId);
      setSelectedSellerDetail(res);
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleEnsure50Sellers = async () => {
    try {
      const res = await api.ensureFiftySellers('Seller@123');
      showNotice('success', res.message);
      await loadAdminOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleCreateSeller = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createSeller(newSellerForm);
      showNotice('success', res.message);
      setShowCreateSellerModal(false);
      setNewSellerForm({
        name: '',
        username: '',
        password: 'Seller@123',
        mobile: '',
        sellerCode: '',
      });
      await loadAdminOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleUpdateSeller = async (e) => {
    e.preventDefault();
    try {
      const res = await api.updateSeller(editingSeller.seller_id, {
        name: editingSeller.seller_name,
        username: editingSeller.username,
        mobile: editingSeller.mobile,
        sellerCode: editingSeller.seller_code,
      });
      showNotice('success', res.message);
      setEditingSeller(null);
      await loadAdminOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleToggleSellerActive = async (seller) => {
    try {
      const res = await api.toggleSellerStatus(seller.seller_id, !seller.is_active);
      showNotice('success', res.message);
      await loadAdminOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.resetSellerPassword(
        resetPasswordSeller.seller_id,
        newPasswordInput
      );
      showNotice('success', res.message);
      setResetPasswordSeller(null);
      setNewPasswordInput('');
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleRecordSettlement = async (e) => {
    e.preventDefault();
    try {
      const targetSellerId = settlementSeller
        ? settlementSeller.seller_id
        : settlementForm.sellerId;
      const res = await api.createSettlement({
        sellerId: Number(targetSellerId),
        amount: Number(settlementForm.amount),
        paymentReference: settlementForm.paymentReference,
        notes: settlementForm.notes,
      });
      showNotice('success', res.message);
      setSettlementSeller(null);
      setSettlementForm({
        sellerId: '',
        amount: '',
        paymentReference: '',
        notes: '',
      });
      await loadAdminOverview();
      if (activeTab === 'finance') {
        const stRes = await api.getSettlements();
        setSettlements(stRes.settlements || []);
      }
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleSaveTicketConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await api.configureSystemAndTickets(configForm);
      showNotice('success', res.message);
      await loadAdminOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const handleAdminChangeTicketStatus = async (ticketId, newStatus) => {
    try {
      const res = await api.updateTicketStatusByAdmin(ticketId, newStatus);
      showNotice('success', res.message);
      setAdminInspectTicket(null);
      await loadAdminOverview();
    } catch (err) {
      showNotice('error', err.message);
    }
  };

  const summary = dashboard?.summary || {
    totalSellers: 0,
    activeSellers: 0,
    totalTickets: 0,
    ticketsSold: 0,
    availableTickets: 0,
    reservedTickets: 0,
    redeemedTickets: 0,
    totalCollection: 0,
    totalCashPayments: 0,
    totalUpiPayments: 0,
    pendingPayments: 0,
    totalSettledWithAdmin: 0,
    pendingSettlements: 0,
  };

  const filteredSellers = (dashboard?.sellerPerformance || []).filter((s) => {
    if (!sellerSearch.trim()) return true;
    const q = sellerSearch.toLowerCase();
    return (
      s.seller_name.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q) ||
      s.seller_code.toLowerCase().includes(q) ||
      (s.mobile && s.mobile.includes(q))
    );
  });

  return (
    <div className="dashboard-container">
      {/* Page Title & Quick Export Bar */}
      <div className="page-header-row">
        <div>
          <h2>Administrator Control Center</h2>
          <p className="text-muted">
            Monitor all 50 sellers, real-time ticket reservations, customer bookings, and financial settlements.
          </p>
        </div>

        <div className="header-actions-group">
          <a
            href={api.getReportExportUrl('sales', 'xlsx')}
            className="btn btn-primary btn-sm"
          >
            <Download size={15} />
            <span>Export Sales (.xlsx)</span>
          </a>
          <a
            href={api.getReportExportUrl('sales', 'csv')}
            className="btn btn-outline btn-sm"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </a>
          <a
            href={api.getReportExportUrl('sellers', 'xlsx')}
            className="btn btn-outline btn-sm"
          >
            <Download size={15} />
            <span>Export Sellers (.xlsx)</span>
          </a>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={loadAdminOverview}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {feedback.text && (
        <div
          className={`alert ${
            feedback.type === 'error' ? 'alert-error' : 'alert-success'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            className="btn-clear-search"
            onClick={() => setFeedback({ type: '', text: '' })}
          >
            ×
          </button>
        </div>
      )}

      {/* 6 Summary Cards Required in Section 9 + Financial Breakdown */}
      <div className="stats-cards-grid admin-stats-grid">
        <div className="stat-card stat-blue">
          <div className="stat-icon">
            <Users size={22} />
          </div>
          <div>
            <span className="stat-label">Total Sellers</span>
            <h3 className="stat-value">{summary.totalSellers}</h3>
            <span className="stat-sub">{summary.activeSellers} Active accounts</span>
          </div>
        </div>

        <div className="stat-card stat-purple">
          <div className="stat-icon">
            <Ticket size={22} />
          </div>
          <div>
            <span className="stat-label">Total Tickets</span>
            <h3 className="stat-value">{summary.totalTickets}</h3>
            <span className="stat-sub">Sequential pool</span>
          </div>
        </div>

        <div className="stat-card stat-red">
          <div className="stat-icon">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="stat-label">Tickets Sold</span>
            <h3 className="stat-value">{summary.ticketsSold}</h3>
            <span className="stat-sub">{summary.redeemedTickets} Redeemed</span>
          </div>
        </div>

        <div className="stat-card stat-emerald">
          <div className="stat-icon">
            <Ticket size={22} />
          </div>
          <div>
            <span className="stat-label">Available Tickets</span>
            <h3 className="stat-value">{summary.availableTickets}</h3>
            <span className="stat-sub">Ready for booking</span>
          </div>
        </div>

        <div className="stat-card stat-orange">
          <div className="stat-icon">
            <Clock size={22} />
          </div>
          <div>
            <span className="stat-label">Reserved Tickets</span>
            <h3 className="stat-value">{summary.reservedTickets}</h3>
            <span className="stat-sub">Pending: ₹{summary.pendingPayments.toFixed(0)}</span>
          </div>
        </div>

        <div className="stat-card stat-gold">
          <div className="stat-icon">
            <IndianRupee size={22} />
          </div>
          <div>
            <span className="stat-label">Total Collection</span>
            <h3 className="stat-value">₹{summary.totalCollection.toFixed(0)}</h3>
            <span className="stat-sub">
              Cash: ₹{summary.totalCashPayments.toFixed(0)} • UPI: ₹
              {summary.totalUpiPayments.toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="nav-tabs-bar">
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <IndianRupee size={16} />
          <span>Overview &amp; Seller Performance</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'sellers' ? 'active' : ''}`}
          onClick={() => setActiveTab('sellers')}
        >
          <Users size={16} />
          <span>Manage 50 Sellers</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setActiveTab('tickets')}
        >
          <Ticket size={16} />
          <span>Tickets &amp; Pool Setup</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => setActiveTab('customers')}
        >
          <Search size={16} />
          <span>Customers Directory</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'finance' ? 'active' : ''}`}
          onClick={() => setActiveTab('finance')}
        >
          <Wallet size={16} />
          <span>Transactions &amp; Settlements</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <Activity size={16} />
          <span>Activity Logs</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & SELLER-WISE TRACKING */}
      {activeTab === 'overview' && (
        <div className="admin-tab-stack">
          {/* Seller Performance Report Table */}
          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h3>Seller-Wise Sales &amp; Settlement Tracking</h3>
                <p className="text-muted-sm">
                  Click any seller&apos;s name (e.g., <strong>Reenal</strong>) to inspect all tickets sold by that seller.
                </p>
              </div>
              <div className="settlement-summary-pills">
                <span className="pill-badge pill-emerald">
                  Submitted to Admin: ₹{summary.totalSettledWithAdmin.toFixed(0)}
                </span>
                <span className="pill-badge pill-orange">
                  Pending Settlements: ₹{summary.pendingSettlements.toFixed(0)}
                </span>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Seller</th>
                    <th>Code</th>
                    <th>Tickets Sold</th>
                    <th>Collection</th>
                    <th>Cash / UPI</th>
                    <th>Submitted</th>
                    <th>Outstanding</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.sellerPerformance || []).slice(0, 15).map((seller) => (
                    <tr key={seller.seller_id}>
                      <td>
                        <button
                          type="button"
                          className="btn-link-seller"
                          onClick={() => handleOpenSellerSales(seller.seller_id)}
                        >
                          {seller.seller_name}
                        </button>
                      </td>
                      <td>
                        <span className="code-badge">{seller.seller_code}</span>
                      </td>
                      <td>
                        <strong>{seller.tickets_sold}</strong>
                      </td>
                      <td>
                        <strong>₹{seller.total_collected.toFixed(0)}</strong>
                      </td>
                      <td className="text-muted-sm">
                        ₹{seller.cash_collected.toFixed(0)} / ₹{seller.upi_collected.toFixed(0)}
                      </td>
                      <td className="text-emerald">
                        ₹{seller.amount_submitted.toFixed(0)}
                      </td>
                      <td>
                        <strong
                          className={
                            seller.outstanding_amount > 0 ? 'text-gold' : 'text-muted'
                          }
                        >
                          ₹{seller.outstanding_amount.toFixed(0)}
                        </strong>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => handleOpenSellerSales(seller.seller_id)}
                          >
                            <Eye size={14} />
                            <span>View Sales</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSettlementSeller(seller);
                              setSettlementForm({
                                sellerId: seller.seller_id,
                                amount:
                                  seller.outstanding_amount > 0
                                    ? String(seller.outstanding_amount)
                                    : '',
                                paymentReference: '',
                                notes: '',
                              });
                            }}
                          >
                            <Wallet size={14} />
                            <span>Settle</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Bookings & Recent Transactions Dual Grid */}
          <div className="dual-section-grid">
            <div className="section-card">
              <div className="section-card-header">
                <h3>Recent Ticket Bookings</h3>
              </div>
              {!dashboard?.recentBookings?.length ? (
                <p className="text-muted">No bookings recorded yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Status</th>
                        <th>Customer</th>
                        <th>Seller</th>
                        <th>Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.recentBookings.slice(0, 10).map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>#{b.ticket_number}</strong>
                          </td>
                          <td>
                            <span
                              className={`status-pill status-${b.status.toLowerCase()}`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td>{b.customer_name || 'Awaiting form'}</td>
                          <td>{b.seller_name}</td>
                          <td>
                            {b.payment_status}
                            {b.payment_method ? ` (${b.payment_method})` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="section-card">
              <div className="section-card-header">
                <h3>Recent Payment Transactions</h3>
              </div>
              {!dashboard?.recentTransactions?.length ? (
                <p className="text-muted">No transactions recorded yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Seller</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.recentTransactions.slice(0, 10).map((tx) => (
                        <tr key={tx.id}>
                          <td>#{tx.ticket_number}</td>
                          <td>{tx.seller_name}</td>
                          <td>{tx.customer_name || '-'}</td>
                          <td>₹{tx.amount.toFixed(0)}</td>
                          <td>{tx.payment_method}</td>
                          <td>
                            <span
                              className={`status-pill status-${tx.payment_status.toLowerCase()}`}
                            >
                              {tx.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MANAGE ALL 50 SELLERS */}
      {activeTab === 'sellers' && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="search-input-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search seller name, username (seller01..50), or code..."
                value={sellerSearch}
                onChange={(e) => setSellerSearch(e.target.value)}
              />
            </div>

            <div className="header-actions-group">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleEnsure50Sellers}
              >
                <Users size={16} />
                <span>Verify / Ensure 50 Sellers</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateSellerModal(true)}
              >
                <UserPlus size={16} />
                <span>Add Seller Account</span>
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Seller Name (Click for Sales)</th>
                  <th>Username</th>
                  <th>Mobile</th>
                  <th>Account Status</th>
                  <th>Tickets Sold</th>
                  <th>Collection</th>
                  <th>Outstanding</th>
                  <th>Admin Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSellers.map((seller) => (
                  <tr key={seller.seller_id}>
                    <td>
                      <span className="code-badge">{seller.seller_code}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-link-seller"
                        onClick={() => handleOpenSellerSales(seller.seller_id)}
                      >
                        {seller.seller_name}
                      </button>
                    </td>
                    <td>
                      <code>{seller.username}</code>
                    </td>
                    <td>{seller.mobile || '-'}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          seller.is_active ? 'status-paid' : 'status-refunded'
                        }`}
                      >
                        {seller.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>
                      <strong>{seller.tickets_sold}</strong>
                    </td>
                    <td>₹{seller.total_collected.toFixed(0)}</td>
                    <td>₹{seller.outstanding_amount.toFixed(0)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleOpenSellerSales(seller.seller_id)}
                          title="View Sold Tickets"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingSeller({ ...seller })}
                          title="Edit Seller Info"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setResetPasswordSeller(seller);
                            setNewPasswordInput('');
                          }}
                          title="Reset Password"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            seller.is_active ? 'btn-danger-outline' : 'btn-success'
                          }`}
                          onClick={() => handleToggleSellerActive(seller)}
                          title={
                            seller.is_active ? 'Deactivate Seller' : 'Activate Seller'
                          }
                        >
                          <Power size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TICKETS & POOL CONFIGURATION */}
      {activeTab === 'tickets' && (
        <div className="admin-tab-stack">
          <div className="section-card">
            <div className="section-card-header">
              <div className="modal-title-group">
                <Settings size={20} className="text-gold" />
                <h3>Configure Event, Ticket Pool Quantity &amp; Sales Status</h3>
              </div>
            </div>

            <form onSubmit={handleSaveTicketConfig} className="config-grid-form">
              <div className="form-group">
                <label>Event Title (Printed on Digital Ticket)</label>
                <input
                  type="text"
                  value={configForm.eventName}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, eventName: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Total Ticket Quantity (001..999, 1000+)</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={configForm.totalTickets}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      totalTickets: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Ticket Price (₹ INR)</label>
                <input
                  type="number"
                  min={1}
                  value={configForm.ticketPrice}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      ticketPrice: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Reservation Expiry (Minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={configForm.reservationExpiryMinutes}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      reservationExpiryMinutes: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Ticket Sales Status</label>
                <select
                  value={configForm.salesEnabled ? 'true' : 'false'}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      salesEnabled: e.target.value === 'true',
                    })
                  }
                >
                  <option value="true">ENABLED (Sellers can reserve &amp; sell)</option>
                  <option value="false">PAUSED (Hold all new reservations)</option>
                </select>
              </div>

              <div className="form-group form-group-end">
                <button type="submit" className="btn btn-primary btn-block">
                  Save Configuration
                </button>
              </div>
            </form>
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <h3>Interactive Ticket Pool Overview (Click Any Ticket to Manage Status)</h3>
            </div>
            <TicketGrid
              tickets={ticketsState.tickets}
              summary={ticketsState.summary}
              onSelectTicket={(tk) => setAdminInspectTicket(tk)}
              onRefresh={loadAdminOverview}
              isAdmin={true}
              loading={loading}
            />
          </div>
        </div>
      )}

      {/* TAB 4: CUSTOMERS DIRECTORY */}
      {activeTab === 'customers' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>All Customers Directory</h3>
            <div className="search-input-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search customer by name, mobile number, or ticket #..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
          </div>

          {!customers.length ? (
            <p className="text-muted">No matching customer records found.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Mobile Number</th>
                    <th>Ticket #</th>
                    <th>Ticket Status</th>
                    <th>Sold By Seller</th>
                    <th>Payment</th>
                    <th>Booking Date</th>
                    <th>Digital Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={`${c.id}-${c.ticket_id || 'none'}`}>
                      <td>
                        <strong>{c.full_name}</strong>
                      </td>
                      <td>{c.mobile}</td>
                      <td>
                        {c.ticket_number ? (
                          <span className="ticket-badge badge-red">
                            #{c.ticket_number}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>{c.ticket_status || '-'}</td>
                      <td>
                        {c.seller_name ? `${c.seller_name} (${c.seller_code})` : '-'}
                      </td>
                      <td>
                        {c.payment_status}
                        {c.payment_method ? ` (${c.payment_method})` : ''}
                      </td>
                      <td>{new Date(c.created_at).toLocaleString()}</td>
                      <td>
                        {c.verification_token ? (
                          <a
                            href={api.getTicketJpgDownloadUrl(c.verification_token)}
                            download={`LuckyDraw-Ticket-${c.ticket_number}.jpg`}
                            className="btn btn-primary btn-sm"
                          >
                            <Download size={14} />
                            <span>JPG</span>
                          </a>
                        ) : (
                          <span className="text-muted-sm">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: TRANSACTIONS & SETTLEMENTS */}
      {activeTab === 'finance' && (
        <div className="admin-tab-stack">
          <div className="dual-section-grid">
            {/* Record Settlement Card */}
            <div className="section-card">
              <div className="section-card-header">
                <h3>Record Seller Money Settlement</h3>
              </div>
              <form onSubmit={handleRecordSettlement} className="login-form">
                <div className="form-group">
                  <label>Select Seller</label>
                  <select
                    value={settlementForm.sellerId}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        sellerId: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">-- Choose Seller --</option>
                    {(dashboard?.sellerPerformance || []).map((s) => (
                      <option key={s.seller_id} value={s.seller_id}>
                        {s.seller_code} - {s.seller_name} (Outstanding: ₹
                        {s.outstanding_amount.toFixed(0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Amount Submitted to Admin (₹ INR)</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    placeholder="Enter amount received"
                    value={settlementForm.amount}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        amount: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Payment Reference / Receipt #</label>
                  <input
                    type="text"
                    placeholder="Cash handover or UPI reference"
                    value={settlementForm.paymentReference}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        paymentReference: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <input
                    type="text"
                    placeholder="Optional settlement remarks"
                    value={settlementForm.notes}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-block">
                  Save Settlement Record
                </button>
              </form>
            </div>

            {/* Settlements History */}
            <div className="section-card">
              <div className="section-card-header">
                <h3>Seller Settlement History</h3>
              </div>
              {!settlements.length ? (
                <p className="text-muted">No settlements recorded yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Seller</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((st) => (
                        <tr key={st.id}>
                          <td>
                            <strong>{st.seller_name}</strong> ({st.seller_code})
                          </td>
                          <td className="text-emerald">
                            <strong>₹{st.amount.toFixed(2)}</strong>
                          </td>
                          <td>{st.payment_reference}</td>
                          <td>{new Date(st.settlement_date).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* All Transactions Table */}
          <div className="section-card">
            <div className="section-card-header">
              <h3>All Payment Transactions</h3>
              <div className="header-actions-group">
                <select
                  value={txFilterMethod}
                  onChange={(e) => setTxFilterMethod(e.target.value)}
                >
                  <option value="">All Payment Methods</option>
                  <option value="Cash">Cash Only</option>
                  <option value="UPI">UPI Only</option>
                </select>
                <select
                  value={txFilterStatus}
                  onChange={(e) => setTxFilterStatus(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Refunded">Refunded</option>
                </select>
                <a
                  href={api.getReportExportUrl('transactions', 'xlsx')}
                  className="btn btn-outline btn-sm"
                >
                  <Download size={14} />
                  <span>Export Transactions (.xlsx)</span>
                </a>
              </div>
            </div>

            {!transactions.length ? (
              <p className="text-muted">No transactions match the selected filter.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Ticket #</th>
                      <th>Seller</th>
                      <th>Customer</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>#{tx.id}</td>
                        <td>
                          <strong>#{tx.ticket_number}</strong>
                        </td>
                        <td>
                          {tx.seller_name} ({tx.seller_code})
                        </td>
                        <td>
                          {tx.customer_name || '-'} ({tx.customer_mobile || '-'})
                        </td>
                        <td>{tx.payment_method}</td>
                        <td>
                          <span
                            className={`status-pill status-${tx.payment_status.toLowerCase()}`}
                          >
                            {tx.payment_status}
                          </span>
                        </td>
                        <td>₹{tx.amount.toFixed(0)}</td>
                        <td>{tx.transaction_reference || '-'}</td>
                        <td>{new Date(tx.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: ACTIVITY LOGS */}
      {activeTab === 'logs' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>Complete System Activity Audit Logs</h3>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {activityLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td>
                      <span className="code-badge">{log.action}</span>
                    </td>
                    <td>
                      {log.user_name
                        ? `${log.user_name} (${log.role})`
                        : 'Public / System'}
                    </td>
                    <td>{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Seller Drill-Down Sales View (e.g., when clicking Reenal) */}
      {selectedSellerDetail && (
        <div className="modal-backdrop">
          <div className="modal-card modal-lg">
            <div className="modal-header">
              <div>
                <h3>
                  Sales Report: {selectedSellerDetail.seller.seller_name} (
                  {selectedSellerDetail.seller.seller_code})
                </h3>
                <p className="text-muted-sm">
                  Tickets Sold: <strong>{selectedSellerDetail.seller.ticketsSoldCount}</strong> •
                  Collection: <strong>₹{selectedSellerDetail.seller.totalCollected}</strong> •
                  Submitted: <strong>₹{selectedSellerDetail.seller.totalSubmitted}</strong> •
                  Outstanding: <strong>₹{selectedSellerDetail.seller.outstandingBalance}</strong>
                </p>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setSelectedSellerDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {!selectedSellerDetail.tickets.length ? (
                <p className="text-muted">
                  No tickets sold or reserved by {selectedSellerDetail.seller.seller_name} yet.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ticket Number</th>
                        <th>Customer</th>
                        <th>Mobile</th>
                        <th>Payment</th>
                        <th>Status</th>
                        <th>Ticket JPG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSellerDetail.tickets.map((tk) => (
                        <tr key={tk.id}>
                          <td>
                            <strong>#{tk.ticket_number}</strong>
                          </td>
                          <td>{tk.customer_name || '-'}</td>
                          <td>{tk.customer_mobile || '-'}</td>
                          <td>
                            <span
                              className={`status-pill status-${tk.payment_status.toLowerCase()}`}
                            >
                              {tk.payment_status}
                              {tk.payment_method ? ` (${tk.payment_method})` : ''}
                            </span>
                          </td>
                          <td>{tk.status}</td>
                          <td>
                            {tk.verification_token ? (
                              <a
                                href={api.getTicketJpgDownloadUrl(tk.verification_token)}
                                download={`LuckyDraw-Ticket-${tk.ticket_number}.jpg`}
                                className="btn btn-primary btn-sm"
                              >
                                <Download size={14} />
                                <span>Download JPG</span>
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Seller Modal */}
      {showCreateSellerModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Create New Seller Account</h3>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setShowCreateSellerModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateSeller} className="login-form">
                <div className="form-group">
                  <label>Seller Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g., Reenal"
                    value={newSellerForm.name}
                    onChange={(e) =>
                      setNewSellerForm({ ...newSellerForm, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Login Username *</label>
                  <input
                    type="text"
                    placeholder="e.g., seller51"
                    value={newSellerForm.username}
                    onChange={(e) =>
                      setNewSellerForm({ ...newSellerForm, username: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Initial Password *</label>
                  <input
                    type="text"
                    value={newSellerForm.password}
                    onChange={(e) =>
                      setNewSellerForm({ ...newSellerForm, password: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={newSellerForm.mobile}
                    onChange={(e) =>
                      setNewSellerForm({ ...newSellerForm, mobile: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Seller Code (Optional - auto-generated if blank)</label>
                  <input
                    type="text"
                    placeholder="e.g., SLR-051"
                    value={newSellerForm.sellerCode}
                    onChange={(e) =>
                      setNewSellerForm({ ...newSellerForm, sellerCode: e.target.value })
                    }
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block">
                  Create Seller
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Seller Modal */}
      {editingSeller && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Edit Seller: {editingSeller.seller_code}</h3>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setEditingSeller(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleUpdateSeller} className="login-form">
                <div className="form-group">
                  <label>Seller Full Name</label>
                  <input
                    type="text"
                    value={editingSeller.seller_name}
                    onChange={(e) =>
                      setEditingSeller({
                        ...editingSeller,
                        seller_name: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={editingSeller.username}
                    onChange={(e) =>
                      setEditingSeller({
                        ...editingSeller,
                        username: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Mobile Number</label>
                  <input
                    type="text"
                    value={editingSeller.mobile || ''}
                    onChange={(e) =>
                      setEditingSeller({
                        ...editingSeller,
                        mobile: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Seller Code</label>
                  <input
                    type="text"
                    value={editingSeller.seller_code}
                    onChange={(e) =>
                      setEditingSeller({
                        ...editingSeller,
                        seller_code: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block">
                  Save Seller Changes
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Reset Seller Password Modal */}
      {resetPasswordSeller && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Reset Password: {resetPasswordSeller.seller_name}</h3>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setResetPasswordSeller(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleResetPasswordSubmit} className="login-form">
                <div className="form-group">
                  <label>New Password for {resetPasswordSeller.username}</label>
                  <input
                    type="text"
                    placeholder="Enter new password (min 6 chars)"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block">
                  Reset Password Now
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Quick Seller Settlement Modal */}
      {settlementSeller && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                Record Settlement: {settlementSeller.seller_name} (
                {settlementSeller.seller_code})
              </h3>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setSettlementSeller(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleRecordSettlement} className="login-form">
                <div className="form-group">
                  <label>Amount Received (₹ INR)</label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={settlementForm.amount}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        amount: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Reference / Receipt Note</label>
                  <input
                    type="text"
                    placeholder="Cash or UPI settlement reference"
                    value={settlementForm.paymentReference}
                    onChange={(e) =>
                      setSettlementForm({
                        ...settlementForm,
                        paymentReference: e.target.value,
                      })
                    }
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-block">
                  Confirm Settlement
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Admin Inspect & Manage Ticket Status Modal */}
      {adminInspectTicket && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Manage Ticket #{adminInspectTicket.ticket_number}</h3>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setAdminInspectTicket(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="ticket-inspect-details">
                <p>
                  <strong>Current Status:</strong> {adminInspectTicket.status}
                </p>
                <p>
                  <strong>Seller:</strong>{' '}
                  {adminInspectTicket.seller_name
                    ? `${adminInspectTicket.seller_name} (${adminInspectTicket.seller_code})`
                    : 'None'}
                </p>
                <p>
                  <strong>Customer:</strong> {adminInspectTicket.customer_name || 'None'}
                </p>
                <p>
                  <strong>Payment Status:</strong> {adminInspectTicket.payment_status}
                </p>
              </div>

              <div className="admin-status-actions">
                <h4>Change Ticket Status</h4>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() =>
                      handleAdminChangeTicketStatus(adminInspectTicket.id, 'AVAILABLE')
                    }
                  >
                    Reset to AVAILABLE
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      handleAdminChangeTicketStatus(adminInspectTicket.id, 'REDEEMED')
                    }
                  >
                    Mark as REDEEMED
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

