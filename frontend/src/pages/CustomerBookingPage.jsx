import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Ticket,
  User,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import DigitalTicketCard from '../components/DigitalTicketCard';

export default function CustomerBookingPage() {
  const { reservationToken } = useParams();
  const [eventInfo, setEventInfo] = useState(null);
  const [booking, setBooking] = useState(null);
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formMsg, setFormMsg] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(null);

  const loadReservation = async () => {
    try {
      const res = await api.getPublicReservation(reservationToken);
      setEventInfo(res.event);
      setBooking(res.booking);
      setError('');
    } catch (err) {
      setError(err.message || 'Invalid or expired reservation link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservation();
    const interval = setInterval(loadReservation, 3000);
    return () => clearInterval(interval);
  }, [reservationToken]);

  useEffect(() => {
    if (!booking?.reservationExpiresAt || booking.status === 'SOLD') return;
    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(booking.reservationExpiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [booking]);

  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFormMsg('');
    setSubmitting(true);

    try {
      const res = await api.submitCustomerBooking(reservationToken, {
        fullName,
        mobile,
      });
      setFormMsg(res.message);
      await loadReservation();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCountdown = (sec) => {
    if (sec === null) return '--:--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="public-booking-shell">
        <div className="public-booking-card">
          <p className="text-center">Loading your ticket reservation...</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="public-booking-shell">
        <div className="public-booking-card">
          <div className="alert alert-error">
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
          <p className="text-muted text-center">
            Please ask your authorized ticket seller to select an available ticket and show a new QR code.
          </p>
        </div>
      </div>
    );
  }

  const isConfirmed = booking?.status === 'SOLD' || booking?.status === 'REDEEMED';

  return (
    <div className="public-booking-shell">
      <div className="public-booking-card">
        <div className="booking-event-banner">
          <div className="booking-event-icon">
            <Ticket size={26} />
          </div>
          <div>
            <h2>{eventInfo?.eventName || 'GRAND DIGITAL LUCKY DRAW'}</h2>
            <p>{eventInfo?.eventSubtitle || 'Official Customer Ticket Booking'}</p>
          </div>
        </div>

        {/* Selected Ticket Summary Strip */}
        <div className="booking-ticket-strip">
          <div>
            <span className="strip-label">RESERVED TICKET</span>
            <span className="strip-ticket-num">#{booking?.ticketNumber}</span>
          </div>
          <div>
            <span className="strip-label">TICKET PRICE</span>
            <span className="strip-price">₹{booking?.ticketPrice}</span>
          </div>
          <div>
            <span className="strip-label">AUTHORIZED SELLER</span>
            <span className="strip-seller">
              {booking?.sellerName} ({booking?.sellerCode})
            </span>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {formMsg && <div className="alert alert-success">{formMsg}</div>}

        {isConfirmed && booking?.verificationToken ? (
          <div className="booking-confirmed-section">
            <div className="confirmed-hero-banner">
              <Sparkles size={24} />
              <div>
                <h3>Payment Confirmed! Your Digital Ticket is Ready</h3>
                <p>
                  Thank you, <strong>{booking.customerName}</strong>! Download your official JPG ticket below.
                </p>
              </div>
            </div>

            <DigitalTicketCard
              ticketNumber={booking.ticketNumber}
              customerName={booking.customerName}
              purchaseDate={booking.confirmedAt}
              sellerName={booking.sellerName}
              sellerCode={booking.sellerCode}
              verificationToken={booking.verificationToken}
              eventName={eventInfo?.eventName}
              ticketPrice={booking.ticketPrice}
            />
          </div>
        ) : booking?.customerSubmitted ? (
          <div className="awaiting-seller-confirmation-box">
            <CheckCircle2 size={42} className="text-emerald" />
            <h3>Details Registered Successfully!</h3>
            <p>
              Ticket <strong>#{booking.ticketNumber}</strong> is registered for{' '}
              <strong>{booking.customerName}</strong> ({booking.customerMobile}).
            </p>
            <div className="awaiting-payment-pill">
              ⏳ Waiting for seller <strong>{booking.sellerName}</strong> to confirm your payment (₹
              {booking.ticketPrice})...
            </div>
            <p className="text-muted-sm">
              Keep this page open. Your downloadable JPG digital ticket will appear here automatically
              as soon as the seller confirms payment!
            </p>
          </div>
        ) : (
          <form onSubmit={handleCustomerSubmit} className="customer-booking-form">
            <div className="countdown-strip">
              <Clock size={16} />
              <span>
                Complete your booking within: <strong>{formatCountdown(secondsLeft)}</strong>
              </span>
            </div>

            <h3>Enter Your Details to Book Ticket #{booking?.ticketNumber}</h3>
            <p className="text-muted-sm">
              No account creation required. Your name and mobile number will be printed on your digital ticket.
            </p>

            <div className="form-group">
              <label htmlFor="custName">Full Name *</label>
              <div className="input-with-icon">
                <User size={18} className="field-icon" />
                <input
                  id="custName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="custMobile">Mobile Number *</label>
              <div className="input-with-icon">
                <Phone size={18} className="field-icon" />
                <input
                  id="custMobile"
                  type="tel"
                  placeholder="Enter your 10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  pattern="[0-9+\-\s]{10,15}"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={submitting}
            >
              {submitting ? 'Submitting Details...' : `Confirm My Details for Ticket #${booking?.ticketNumber}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

