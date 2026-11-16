import React, { useState, useEffect, useCallback } from 'react';
import {
  Ticket,
  IndianRupee,
  Clock,
  Wallet,
  QrCode,
  CheckCircle2,
  Download,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { api } from '../services/api';
import TicketGrid from '../components/TicketGrid';
import QrReservationModal from '../components/QrReservationModal';
import DigitalTicketCard from '../components/DigitalTicketCard';

export default function SellerDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('grid');
  const [dashboardData, setDashboardData] = useState(null);
  const [ticketsData, setTicketsData] = useState({ tickets: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [reservingTicketNumber, setReservingTicketNumber] = useState(null);
  const [alertError, setAlertError] = useState('');
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [previewSaleTicket, setPreviewSaleTicket] = useState(null);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, tkRes] = await Promise.all([
        api.getSellerDashboard(),
        api.getTickets(),
      ]);
      setDashboardData(dashRes);
      setTicketsData({
        tickets: tkRes.tickets || [],
        summary: tkRes.summary || {},
        settings: tkRes.settings || {},
      });
    } catch (err) {
      setAlertError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleSelectAvailableTicket = async (ticket) => {
    if (ticket.status !== 'AVAILABLE') return;
    setAlertError('');
    setReservingTicketNumber(ticket.ticket_number);

    try {
      const res = await api.reserveTicket(ticket.ticket_number);
      setSelectedReservation(res.reservation);
      await fetchAllData();
    } catch (err) {
      setAlertError(err.message);
      await fetchAllData();
    } finally {
      setReservingTicketNumber(null);
    }
  };

  const stats = dashboardData?.stats || {
    ticketsSold: 0,
    activeReservations: 0,
    totalCollected: 0,
    cashCollected: 0,
    upiCollected: 0,
    pendingAmount: 0,
    moneySubmittedToAdmin: 0,
    outstandingBalance: 0,
  };

  return (
    <div className="dashboard-container">
      {/* Top Seller Welcome & Quick Action Header */}
      <div className="page-header-row">
        <div>
          <h2>
            Welcome, {dashboardData?.seller?.name || user?.name}{' '}
            <span className="code-badge">
              {dashboardData?.seller?.sellerCode || user?.sellerCode}
            </span>
          </h2>
          <p className="text-muted">
            Select an available ticket to generate a customer QR code and confirm sales.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={fetchAllData}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Sync Data</span>
        </button>
      </div>

      {alertError && (
        <div className="alert alert-error">
          <span>{alertError}</span>
          <button
            type="button"
            className="btn-clear-search"
            onClick={() => setAlertError('')}
          >
            ×
          </button>
        </div>
      )}

      {/* Seller Summary Cards (Mobile-First Grid) */}
      <div className="stats-cards-grid seller-stats-grid">
        <div className="stat-card stat-emerald">
          <div className="stat-icon">
            <Ticket size={22} />
          </div>
          <div>
            <span className="stat-label">Tickets Sold</span>
            <h3 className="stat-value">{stats.ticketsSold}</h3>
            <span className="stat-sub">Confirmed sales</span>
          </div>
        </div>

        <div className="stat-card stat-gold">
          <div className="stat-icon">
            <IndianRupee size={22} />
          </div>
          <div>
            <span className="stat-label">Total Collection</span>
            <h3 className="stat-value">₹{stats.totalCollected.toFixed(0)}</h3>
            <span className="stat-sub">
              Cash: ₹{stats.cashCollected.toFixed(0)} • UPI: ₹{stats.upiCollected.toFixed(0)}
            </span>
          </div>
        </div>

        <div className="stat-card stat-orange">
          <div className="stat-icon">
            <Clock size={22} />
          </div>
          <div>
            <span className="stat-label">Pending Payments</span>
            <h3 className="stat-value">₹{stats.pendingAmount.toFixed(0)}</h3>
            <span className="stat-sub">
              {stats.activeReservations} active reservation(s)
            </span>
          </div>
        </div>

        <div className="stat-card stat-blue">
          <div className="stat-icon">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="stat-label">Submitted to Admin</span>
            <h3 className="stat-value">₹{stats.moneySubmittedToAdmin.toFixed(0)}</h3>
            <span className="stat-sub">Settled amount</span>
          </div>
        </div>

        <div className="stat-card stat-purple">
          <div className="stat-icon">
            <Wallet size={22} />
          </div>
          <div>
            <span className="stat-label">Outstanding Settlement</span>
            <h3 className="stat-value">₹{stats.outstandingBalance.toFixed(0)}</h3>
            <span className="stat-sub">Balance to submit to Admin</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs-bar">
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'grid' ? 'active' : ''}`}
          onClick={() => setActiveTab('grid')}
        >
          <Ticket size={16} />
          <span>Select Ticket ({ticketsData.summary.available ?? 0} Available)</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'reservations' ? 'active' : ''}`}
          onClick={() => setActiveTab('reservations')}
        >
          <QrCode size={16} />
          <span>Active Reservations ({dashboardData?.activeReservations?.length || 0})</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          <CheckCircle2 size={16} />
          <span>My Confirmed Sales ({dashboardData?.sales?.length || 0})</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'finance' ? 'active' : ''}`}
          onClick={() => setActiveTab('finance')}
        >
          <Wallet size={16} />
          <span>Transactions &amp; Settlements</span>
        </button>
      </div>

      {/* TAB 1: TICKET SELECTION GRID */}
      {activeTab === 'grid' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>Select an Available Ticket to Generate Customer Booking QR</h3>
            <span className="price-tag-pill">
              Ticket Price: ₹{ticketsData.settings?.ticketPrice || 50}
            </span>
          </div>
          <TicketGrid
            tickets={ticketsData.tickets}
            summary={ticketsData.summary}
            onSelectTicket={handleSelectAvailableTicket}
            onRefresh={fetchAllData}
            isAdmin={false}
            loading={loading}
            reservingTicketNumber={reservingTicketNumber}
          />
        </div>
      )}

      {/* TAB 2: ACTIVE RESERVATIONS */}
      {activeTab === 'reservations' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>Your Temporarily Reserved Tickets</h3>
          </div>
          {!dashboardData?.activeReservations?.length ? (
            <div className="empty-state-box">
              <QrCode size={32} />
              <p>You have no active ticket reservations right now.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setActiveTab('grid')}
              >
                Select an Available Ticket
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Customer Status</th>
                    <th>Mobile</th>
                    <th>Expires At</th>
                    <th>Payment Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.activeReservations.map((res) => (
                    <tr key={res.id}>
                      <td>
                        <span className="ticket-badge badge-orange">
                          #{res.ticket_number}
                        </span>
                      </td>
                      <td>
                        {res.customer_name ? (
                          <strong className="text-emerald">
                            ✓ {res.customer_name}
                          </strong>
                        ) : (
                          <span className="text-muted">
                            Awaiting QR Scan...
                          </span>
                        )}
                      </td>
                      <td>{res.customer_mobile || '-'}</td>
                      <td>
                        {res.reservation_expires_at
                          ? new Date(res.reservation_expires_at).toLocaleTimeString()
                          : '-'}
                      </td>
                      <td>
                        <span className="status-pill status-pending">
                          {res.payment_status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setSelectedReservation(res)}
                        >
                          <QrCode size={14} />
                          <span>Show QR / Confirm Payment</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CONFIRMED SALES */}
      {activeTab === 'sales' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>My Confirmed Ticket Sales</h3>
          </div>
          {!dashboardData?.sales?.length ? (
            <div className="empty-state-box">
              <Ticket size={32} />
              <p>No confirmed sales yet. Reserve a ticket and confirm customer payment to start!</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticket Number</th>
                    <th>Customer Name</th>
                    <th>Mobile Number</th>
                    <th>Payment</th>
                    <th>Amount</th>
                    <th>Confirmed Date</th>
                    <th>Digital Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <span className="ticket-badge badge-red">
                          #{sale.ticket_number}
                        </span>
                      </td>
                      <td>
                        <strong>{sale.customer_name}</strong>
                      </td>
                      <td>{sale.customer_mobile}</td>
                      <td>
                        <span className="status-pill status-paid">
                          {sale.payment_status} ({sale.payment_method})
                        </span>
                      </td>
                      <td>₹{sale.ticket_price.toFixed(0)}</td>
                      <td>
                        {sale.confirmed_at
                          ? new Date(sale.confirmed_at).toLocaleString()
                          : '-'}
                      </td>
                      <td>
                        {sale.verification_token && (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setPreviewSaleTicket(sale)}
                            >
                              <Eye size={14} />
                              <span>Preview</span>
                            </button>
                            <a
                              href={api.getTicketJpgDownloadUrl(sale.verification_token)}
                              download={`LuckyDraw-Ticket-${sale.ticket_number}.jpg`}
                              className="btn btn-primary btn-sm"
                            >
                              <Download size={14} />
                              <span>JPG</span>
                            </a>
                          </div>
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

      {/* TAB 4: TRANSACTIONS & SETTLEMENTS */}
      {activeTab === 'finance' && (
        <div className="dual-section-grid">
          <div className="section-card">
            <div className="section-card-header">
              <h3>My Payment Transaction History</h3>
            </div>
            {!dashboardData?.transactions?.length ? (
              <p className="text-muted">No payment transactions recorded yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Customer</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>#{tx.ticket_number}</td>
                        <td>{tx.customer_name || '-'}</td>
                        <td>{tx.payment_method}</td>
                        <td>
                          <span
                            className={`status-pill status-${tx.payment_status.toLowerCase()}`}
                          >
                            {tx.payment_status}
                          </span>
                        </td>
                        <td>₹{tx.amount.toFixed(0)}</td>
                        <td>{new Date(tx.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="section-card">
            <div className="section-card-header">
              <h3>Money Submitted to Admin (Settlements)</h3>
            </div>
            {!dashboardData?.settlements?.length ? (
              <p className="text-muted">No settlements recorded with Admin yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.settlements.map((st) => (
                      <tr key={st.id}>
                        <td>{new Date(st.settlement_date).toLocaleString()}</td>
                        <td>
                          <strong className="text-emerald">
                            ₹{st.amount.toFixed(2)}
                          </strong>
                        </td>
                        <td>{st.payment_reference}</td>
                        <td>{st.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active QR Reservation Modal */}
      {selectedReservation && (
        <QrReservationModal
          reservation={selectedReservation}
          onClose={() => setSelectedReservation(null)}
          onConfirmedOrReleased={fetchAllData}
        />
      )}

      {/* Confirmed Digital Ticket Preview Modal */}
      {previewSaleTicket && (
        <div className="modal-backdrop">
          <div className="modal-card modal-lg">
            <div className="modal-header">
              <h3>Digital Ticket #{previewSaleTicket.ticket_number}</h3>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setPreviewSaleTicket(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <DigitalTicketCard
                ticketNumber={previewSaleTicket.ticket_number}
                customerName={previewSaleTicket.customer_name}
                purchaseDate={previewSaleTicket.confirmed_at}
                sellerName={dashboardData?.seller?.name}
                sellerCode={dashboardData?.seller?.sellerCode}
                verificationToken={previewSaleTicket.verification_token}
                ticketPrice={previewSaleTicket.ticket_price}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

