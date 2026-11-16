import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Copy,
  CheckCircle2,
  Clock,
  ExternalLink,
  UserCheck,
  CreditCard,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import DigitalTicketCard from './DigitalTicketCard';

export default function QrReservationModal({
  reservation,
  onClose,
  onConfirmedOrReleased,
}) {
  const [liveBooking, setLiveBooking] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionReference, setTransactionReference] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerMobile, setManualCustomerMobile] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmedTicket, setConfirmedTicket] = useState(null);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);

  const reservationToken =
    reservation?.reservationToken || reservation?.reservation_token;
  const ticketId = reservation?.ticketId || reservation?.id;
  const ticketNumber = reservation?.ticketNumber || reservation?.ticket_number;
  const qrCodeDataUrl = reservation?.qrCodeDataUrl;
  const bookingUrl =
    reservation?.bookingUrl || `${window.location.origin}/book/${reservationToken}`;

  // Poll reservation status every 3s to detect when customer submits the QR booking form
  useEffect(() => {
    if (!reservationToken || confirmedTicket) return;

    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await api.getPublicReservation(reservationToken);
        if (mounted && res.booking) {
          setLiveBooking(res.booking);
          if (res.booking.status === 'SOLD' && res.booking.verificationToken) {
            setConfirmedTicket({
              ticketNumber: res.booking.ticketNumber,
              customerName: res.booking.customerName,
              purchaseDate: res.booking.confirmedAt,
              sellerName: res.booking.sellerName,
              sellerCode: res.booking.sellerCode,
              verificationToken: res.booking.verificationToken,
              ticketPrice: res.booking.ticketPrice,
            });
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    fetchStatus();
    const pollTimer = setInterval(fetchStatus, 3000);
    return () => {
      mounted = false;
      clearInterval(pollTimer);
    };
  }, [reservationToken, confirmedTicket]);

  // Countdown timer for reservation expiry
  useEffect(() => {
    const expStr =
      liveBooking?.reservationExpiresAt ||
      reservation?.reservationExpiresAt ||
      reservation?.reservation_expires_at;
    if (!expStr || confirmedTicket) return;

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((new Date(expStr).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [liveBooking, reservation, confirmedTicket]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      const res = await api.confirmTicketPayment(ticketId, {
        paymentMethod,
        transactionReference,
        customerName: manualCustomerName,
        customerMobile: manualCustomerMobile,
      });

      setSuccessMsg(res.message);
      setConfirmedTicket({
        ticketNumber: res.data.ticketNumber,
        customerName: res.data.customerName,
        purchaseDate: res.data.confirmedAt,
        sellerName: liveBooking?.sellerName || 'Authorized Seller',
        sellerCode: liveBooking?.sellerCode || 'SLR',
        verificationToken: res.data.verificationToken,
        ticketPrice: liveBooking?.ticketPrice || reservation?.ticketPrice || 50,
      });

      if (onConfirmedOrReleased) {
        onConfirmedOrReleased();
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPending = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const res = await api.recordPendingPayment(ticketId, {
        paymentMethod,
        transactionReference,
      });
      setSuccessMsg(res.message);
      if (onConfirmedOrReleased) onConfirmedOrReleased();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReservation = async () => {
    setErrorMsg('');
    setSubmitting(true);
    try {
      await api.cancelReservation(ticketId);
      if (onConfirmedOrReleased) onConfirmedOrReleased();
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
      setSubmitting(false);
    }
  };

  const formatCountdown = (sec) => {
    if (sec === null) return '--:--';
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const customerSubmitted =
    liveBooking?.customerSubmitted || Boolean(reservation?.customer_name);
  const customerNameDisplay =
    liveBooking?.customerName || reservation?.customer_name;
  const customerMobileDisplay =
    liveBooking?.customerMobile || reservation?.customer_mobile;

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div className="modal-title-group">
            <QrCode size={22} className="text-gold" />
            <h3>
              Ticket #{ticketNumber} —{' '}
              {confirmedTicket ? 'Sale Confirmed!' : 'Customer Booking & QR Reservation'}
            </h3>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
          {successMsg && <div className="alert alert-success">{successMsg}</div>}

          {confirmedTicket ? (
            <div>
              <DigitalTicketCard
                ticketNumber={confirmedTicket.ticketNumber}
                customerName={confirmedTicket.customerName}
                purchaseDate={confirmedTicket.purchaseDate}
                sellerName={confirmedTicket.sellerName}
                sellerCode={confirmedTicket.sellerCode}
                verificationToken={confirmedTicket.verificationToken}
                ticketPrice={confirmedTicket.ticketPrice}
              />
              <div className="modal-footer-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Close Window
                </button>
              </div>
            </div>
          ) : (
            <div className="qr-workflow-grid">
              {/* Left Column: QR Code for Customer to Scan */}
              <div className="qr-display-column">
                <div className="countdown-banner">
                  <Clock size={16} />
                  <span>
                    Reservation Expires In: <strong>{formatCountdown(secondsLeft)}</strong>
                  </span>
                </div>

                {qrCodeDataUrl && (
                  <div className="qr-image-box">
                    <img
                      src={qrCodeDataUrl}
                      alt={`Booking QR for Ticket #${ticketNumber}`}
                    />
                  </div>
                )}

                <p className="qr-instruction-text">
                  Show this QR code to the customer on your phone. When scanned, the customer
                  is redirected to enter their Full Name and Mobile Number.
                </p>

                <div className="booking-link-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleCopyLink}
                  >
                    <Copy size={14} />
                    <span>{copied ? 'Link Copied!' : 'Copy Booking Link'}</span>
                  </button>
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    <ExternalLink size={14} />
                    <span>Open Customer Page</span>
                  </a>
                </div>
              </div>

              {/* Right Column: Customer Status & Seller Payment Confirmation */}
              <div className="payment-confirmation-column">
                <div className="customer-status-panel">
                  <h4>Step 1: Customer Details Status</h4>
                  {customerSubmitted ? (
                    <div className="customer-submitted-badge">
                      <UserCheck size={20} className="text-emerald" />
                      <div>
                        <strong>Customer Form Received!</strong>
                        <p>
                          Name: <strong>{customerNameDisplay}</strong>
                        </p>
                        <p>
                          Mobile: <strong>{customerMobileDisplay}</strong>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="customer-waiting-box">
                      <p className="waiting-pulse">
                        ⏳ Waiting for customer to scan QR &amp; submit details...
                      </p>
                      <p className="text-muted-sm">
                        Or enter customer details manually below if assisting customer in person:
                      </p>
                      <div className="form-row-compact">
                        <input
                          type="text"
                          placeholder="Customer Full Name"
                          value={manualCustomerName}
                          onChange={(e) => setManualCustomerName(e.target.value)}
                        />
                        <input
                          type="tel"
                          placeholder="10-Digit Mobile Number"
                          value={manualCustomerMobile}
                          onChange={(e) => setManualCustomerMobile(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleConfirmPayment} className="payment-confirm-form">
                  <h4>Step 2: Record &amp; Confirm Payment</h4>

                  <div className="form-group">
                    <label>Payment Method</label>
                    <div className="payment-method-selector">
                      <button
                        type="button"
                        className={`method-btn ${paymentMethod === 'Cash' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('Cash')}
                      >
                        💵 Cash (₹{liveBooking?.ticketPrice || reservation?.ticketPrice || 50})
                      </button>
                      <button
                        type="button"
                        className={`method-btn ${paymentMethod === 'UPI' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('UPI')}
                      >
                        📱 UPI (₹{liveBooking?.ticketPrice || reservation?.ticketPrice || 50})
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Transaction Reference / Receipt Note (Optional)</label>
                    <input
                      type="text"
                      placeholder={
                        paymentMethod === 'UPI'
                          ? 'Enter UPI Ref / UTR Number (optional)'
                          : 'Cash receipt note (optional)'
                      }
                      value={transactionReference}
                      onChange={(e) => setTransactionReference(e.target.value)}
                    />
                  </div>

                  <div className="confirm-buttons-stack">
                    <button
                      type="submit"
                      className="btn btn-success btn-block"
                      disabled={submitting}
                    >
                      <CheckCircle2 size={18} />
                      <span>
                        {submitting
                          ? 'Confirming Sale...'
                          : 'Confirm Payment Received & Issue Ticket'}
                      </span>
                    </button>

                    <div className="secondary-actions-split">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={handleRecordPending}
                        disabled={submitting}
                      >
                        <CreditCard size={14} />
                        <span>Log as Pending Payment</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-danger-outline btn-sm"
                        onClick={handleCancelReservation}
                        disabled={submitting}
                      >
                        <Trash2 size={14} />
                        <span>Release Ticket</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

