import React from 'react';
import { Download, ShieldCheck, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import { ticketTheme } from '../assets/ticketTheme';

export default function DigitalTicketCard({
  ticketNumber,
  customerName,
  purchaseDate,
  sellerName,
  sellerCode,
  verificationToken,
  eventName,
  ticketPrice = 50,
}) {
  if (!verificationToken) return null;

  const jpgUrl = api.getTicketJpgDownloadUrl(verificationToken);

  return (
    <div className="digital-ticket-wrapper">
      <div className="digital-ticket-header">
        <div className="badge-verified">
          <ShieldCheck size={16} />
          <span>Confirmed &amp; Verified Digital Ticket</span>
        </div>
        <div className="ticket-actions-row">
          <a
            href={jpgUrl}
            download={`LuckyDraw-Ticket-${ticketNumber}.jpg`}
            className="btn btn-primary btn-download-jpg"
          >
            <Download size={16} />
            <span>Download JPG Ticket</span>
          </a>
          <a
            href={`/verify/${verificationToken}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm"
          >
            <ExternalLink size={14} />
            <span>Verify Token</span>
          </a>
        </div>
      </div>

      {/* Live Preview of the Server-Generated High-Resolution JPG Ticket */}
      <div className="ticket-jpg-preview-frame">
        <img
          src={jpgUrl}
          alt={`Digital Lucky Draw Ticket #${ticketNumber}`}
          className="ticket-jpg-image"
        />
      </div>

      <div className="ticket-meta-caption">
        <span>
          <strong>Event:</strong> {eventName || ticketTheme.defaultEventName}
        </span>
        <span>
          <strong>Ticket:</strong> #{ticketNumber}
        </span>
        <span>
          <strong>Customer:</strong> {customerName}
        </span>
        <span>
          <strong>Seller:</strong> {sellerName} ({sellerCode})
        </span>
        <span>
          <strong>Amount Paid:</strong> ₹{Number(ticketPrice).toFixed(0)}
        </span>
        {purchaseDate && (
          <span>
            <strong>Confirmed:</strong> {new Date(purchaseDate).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

