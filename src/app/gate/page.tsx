'use client';

import React, { useState, useEffect } from 'react';
import { getBookings, saveBookings, addAuditLog, Booking } from '../../services/database';
import { verifyOfflineTicket, QRData } from '../../services/algorithms';

export default function GateValidationPortal() {
  const [ticketInput, setTicketInput] = useState('');
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
    ticketDetails?: QRData;
  } | null>(null);
  const [offlineValidatedList, setOfflineValidatedList] = useState<Booking[]>([]);

  useEffect(() => {
    // Load already validated tickets
    const validated = getBookings().filter(b => b.isValidated);
    setOfflineValidatedList(validated);
  }, []);

  const handleValidate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketInput.trim()) {
      alert('Please paste or scan a ticket code.');
      return;
    }

    try {
      const qrData: QRData = JSON.parse(ticketInput);
      
      // RUN CRYPTOGRAPHIC OFFLINE VERIFICATION ALGORITHM
      const isSignatureValid = verifyOfflineTicket(qrData);

      if (isSignatureValid) {
        // Find ticket in local database and mark validated
        const bookings = getBookings();
        const ticketIdx = bookings.findIndex(b => b.id === qrData.ticketId);

        let systemMessage = 'Validated Offline: Cryptographic signature verified successfully.';
        
        if (ticketIdx !== -1) {
          if (bookings[ticketIdx].isValidated) {
            setValidationResult({
              success: false,
              message: `Ticket already verified at ${bookings[ticketIdx].validatedAt}. Warning: Duplicate scan attempt detected.`,
              ticketDetails: qrData
            });
            addAuditLog(
              'system',
              'security_duplicate_scan',
              `Warning: Duplicate offline scan attempt detected for Ticket ID ${qrData.ticketId}.`
            );
            return;
          }

          bookings[ticketIdx].isValidated = true;
          bookings[ticketIdx].validatedAt = new Date().toLocaleTimeString();
          saveBookings(bookings);
          setOfflineValidatedList(bookings.filter(b => b.isValidated));
          systemMessage = `Validated Offline: Successfully checked in ${qrData.passengerName} to Seat ${qrData.seatNumber}.`;
        } else {
          // If ticket was generated offline (e.g. peer to peer) and database doesn't have it yet,
          // it still passes validation because the signature matches! This illustrates pure offline survival.
          systemMessage = `Validated Offline: Signature matches cryptographic secret keys. Passenger verified (un-synced database log created).`;
        }

        setValidationResult({
          success: true,
          message: systemMessage,
          ticketDetails: qrData
        });

        addAuditLog(
          'operator',
          'ticket_verification_offline',
          `Gate validated Ticket ID ${qrData.ticketId} offline. Passenger: ${qrData.passengerName}, Seat: ${qrData.seatNumber}.`
        );

      } else {
        setValidationResult({
          success: false,
          message: 'Verification Failed: Cryptographic signature mismatch. Potential forged or altered ticket payload.',
          ticketDetails: qrData
        });

        addAuditLog(
          'system',
          'security_signature_mismatch',
          `Security Alert: Ticket signature mismatch detected on validation input: ${ticketInput.slice(0, 100)}...`
        );
      }
    } catch (err) {
      setValidationResult({
        success: false,
        message: 'Invalid Scan Payload: Input does not match the transit ticket structural template.'
      });
    }
  };

  const clearInput = () => {
    setTicketInput('');
    setValidationResult(null);
  };

  // Pre-load a valid simulated ticket to make testing extremely easy for the user
  const loadSimulatedTicket = () => {
    const validMockTicket = {
      ticketId: "TKT-3829-GH",
      passengerName: "Kofi Mensah",
      seatNumber: 14,
      busNumber: "VIP-843-26",
      signature: "1B3F9A7D" // Correctly signed payload based on algorithm
    };
    setTicketInput(JSON.stringify(validMockTicket, null, 2));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
      
      <section style={{ textAlign: 'center', padding: '16px 0' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '8px', background: 'linear-gradient(135deg, #f3f4f6 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Gate Validation Scanner Portal
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Scan, decrypt, and verify tickets completely offline using local cryptographic key matches
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Verification Input Panel */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Scan Input</h2>
          
          <form onSubmit={handleValidate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Paste Scanned QR Payload String:
              </label>
              <textarea
                rows={6}
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder='{"ticketId":"...", "passengerName":"...", "signature":"..."}'
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '10px',
                  padding: '12px',
                  color: 'var(--text-main)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" onClick={loadSimulatedTicket} className="btn-secondary" style={{ flex: 1, fontSize: '0.85rem' }}>
                Load Mock Valid QR
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1, fontSize: '0.85rem' }}>
                Verify Cryptography
              </button>
            </div>
          </form>

          {validationResult && (
            <div style={{ 
              marginTop: '24px', 
              padding: '20px', 
              borderRadius: '12px', 
              border: '1px solid',
              background: validationResult.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
              borderColor: validationResult.success ? 'var(--glow-green)' : 'var(--glow-red)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className={`badge ${validationResult.success ? 'badge-success' : 'badge-error'}`}>
                  {validationResult.success ? 'VERIFIED' : 'ALERT / INVALID'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Offline Validation Node</span>
              </div>
              
              <p style={{ fontSize: '0.95rem', fontWeight: 500, margin: '8px 0', color: 'var(--text-main)' }}>
                {validationResult.message}
              </p>

              {validationResult.ticketDetails && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px', marginTop: '8px' }}>
                  <p>Ticket ID: {validationResult.ticketDetails.ticketId}</p>
                  <p>Passenger: {validationResult.ticketDetails.passengerName}</p>
                  <p>Seat: {validationResult.ticketDetails.seatNumber}</p>
                  <p>Bus Code: {validationResult.ticketDetails.busNumber}</p>
                  <p style={{ wordBreak: 'break-all' }}>Signed Signature Hash: {validationResult.ticketDetails.signature}</p>
                </div>
              )}

              <button onClick={clearInput} className="btn-secondary" style={{ width: '100%', marginTop: '16px', padding: '8px' }}>
                Clear Scanner
              </button>
            </div>
          )}
        </section>

        {/* Offline Validation Logs */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Offline Validation Log</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            List of passengers checked in locally at the boarding gate. This log syncs with central operators when communication recovers.
          </p>

          {offlineValidatedList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {offlineValidatedList.map(item => (
                <div key={item.id} style={{
                  background: 'rgba(255, 255, 255, 0.01)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.passengerName}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ticket: {item.id} | Seat: {item.seatNumber}</p>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--glow-green)', fontWeight: 600 }}>
                    Checked In {item.validatedAt ? `@ ${item.validatedAt}` : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
              No check-in operations recorded on this node.
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
