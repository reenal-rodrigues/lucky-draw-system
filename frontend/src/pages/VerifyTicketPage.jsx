import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import DigitalTicketCard from '../components/DigitalTicketCard';

export default function VerifyTicketPage() {
  const { verificationToken } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .verifyTicketToken(verificationToken)
      .then((res) => setResult(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [verificationToken]);

  return (
    <div className="public-booking-shell">
      <div className="public-booking-card">
        {loading ? (
          <p className="text-center">Verifying cryptographic ticket token...</p>
        ) : error || !result?.authentic ? (
          <div className="verify-failed-box">
            <ShieldAlert size={48} className="text-red" />
            <h3>Invalid or Unverified Ticket Token</h3>
            <p>{error || 'No confirmed digital ticket matches this token.'}</p>
          </div>
        ) : (
          <div>
            <div className="confirmed-hero-banner">
              <ShieldCheck size={28} />
              <div>
                <h3>{result.message}</h3>
                <p>
                  Ticket <strong>#{result.ticket.ticketNumber}</strong> • Status:{' '}
                  <strong>{result.ticket.status}</strong> • Holder:{' '}
                  <strong>{result.ticket.customerName}</strong> ({result.ticket.maskedMobile})
                </p>
              </div>
            </div>

            <DigitalTicketCard
              ticketNumber={result.ticket.ticketNumber}
              customerName={result.ticket.customerName}
              purchaseDate={result.ticket.confirmedAt}
              sellerName={result.ticket.sellerName}
              sellerCode={result.ticket.sellerCode}
              verificationToken={verificationToken}
            />
          </div>
        )}
      </div>
    </div>
  );
}

