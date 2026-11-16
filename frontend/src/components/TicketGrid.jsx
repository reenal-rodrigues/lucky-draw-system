import React, { useState } from 'react';
import { Search, Filter, RefreshCw } from 'lucide-react';

export default function TicketGrid({
  tickets = [],
  summary = {},
  onSelectTicket,
  onRefresh,
  isAdmin = false,
  loading = false,
  reservingTicketNumber = null,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const cleanSearch = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !cleanSearch ||
      t.ticket_number.toLowerCase().includes(cleanSearch) ||
      String(parseInt(t.ticket_number, 10)) === cleanSearch ||
      (t.customer_name && t.customer_name.toLowerCase().includes(cleanSearch)) ||
      (t.seller_name && t.seller_name.toLowerCase().includes(cleanSearch));
    return matchesStatus && matchesSearch;
  });

  const getTicketStatusClass = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return 'ticket-cell-available'; // Green
      case 'RESERVED':
        return 'ticket-cell-reserved'; // Orange
      case 'SOLD':
        return 'ticket-cell-sold'; // Red
      case 'REDEEMED':
        return 'ticket-cell-redeemed'; // Dark grey
      default:
        return 'ticket-cell-available';
    }
  };

  return (
    <div className="ticket-grid-container">
      {/* Legend & Filter Bar */}
      <div className="ticket-toolbar">
        <div className="search-input-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder={
              isAdmin
                ? 'Search ticket # (e.g. 001), customer, or seller...'
                : 'Search ticket number (e.g. 001, 025, 100)...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setSearchTerm('')}
            >
              ×
            </button>
          )}
        </div>

        <div className="status-filter-pills">
          <button
            type="button"
            className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All ({summary.total ?? tickets.length})
          </button>
          <button
            type="button"
            className={`filter-pill pill-green ${statusFilter === 'AVAILABLE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('AVAILABLE')}
          >
            <span className="dot dot-green" /> Available ({summary.available ?? 0})
          </button>
          <button
            type="button"
            className={`filter-pill pill-orange ${statusFilter === 'RESERVED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('RESERVED')}
          >
            <span className="dot dot-orange" /> Reserved ({summary.reserved ?? 0})
          </button>
          <button
            type="button"
            className={`filter-pill pill-red ${statusFilter === 'SOLD' ? 'active' : ''}`}
            onClick={() => setStatusFilter('SOLD')}
          >
            <span className="dot dot-red" /> Sold ({summary.sold ?? 0})
          </button>
          <button
            type="button"
            className={`filter-pill pill-grey ${statusFilter === 'REDEEMED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('REDEEMED')}
          >
            <span className="dot dot-grey" /> Redeemed ({summary.redeemed ?? 0})
          </button>
          {onRefresh && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh Ticket Availability"
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Color Legend */}
      <div className="ticket-color-legend">
        <div className="legend-item">
          <span className="legend-swatch swatch-green" />
          <span>Green = Available (Tap to Reserve)</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-orange" />
          <span>Orange = Temporarily Reserved</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-red" />
          <span>Red = Sold</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-grey" />
          <span>Dark Grey = Redeemed</span>
        </div>
      </div>

      {/* Ticket Number Grid */}
      {filteredTickets.length === 0 ? (
        <div className="empty-state-box">
          <Filter size={28} />
          <p>No tickets match your current search or status filter.</p>
        </div>
      ) : (
        <div className="ticket-numbers-grid">
          {filteredTickets.map((ticket) => {
            const isSelectable = isAdmin || ticket.status === 'AVAILABLE';
            const isBeingReserved = reservingTicketNumber === ticket.ticket_number;

            return (
              <button
                key={ticket.id}
                type="button"
                disabled={!isSelectable || isBeingReserved}
                onClick={() => onSelectTicket && onSelectTicket(ticket)}
                className={`ticket-cell ${getTicketStatusClass(ticket.status)} ${
                  !isSelectable ? 'ticket-cell-disabled' : ''
                }`}
                title={
                  ticket.status === 'AVAILABLE'
                    ? `Ticket #${ticket.ticket_number} - Available (₹${ticket.ticket_price})`
                    : `Ticket #${ticket.ticket_number} - ${ticket.status}${
                        ticket.seller_name ? ` by ${ticket.seller_name}` : ''
                      }`
                }
              >
                <span className="ticket-cell-num">#{ticket.ticket_number}</span>
                <span className="ticket-cell-status">
                  {isBeingReserved ? 'WAIT...' : ticket.status}
                </span>
                {isAdmin && ticket.seller_code && (
                  <span className="ticket-cell-meta">{ticket.seller_code}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

