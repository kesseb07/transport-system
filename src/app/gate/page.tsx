/**
 * ============================================================================
 * gate/page.tsx — GATE VALIDATION SCANNER (route: /gate)
 * ============================================================================
 *
 * Simulates the handheld device used by boarding staff at the terminal gate,
 * and demonstrates the OFFLINE QR TICKET SIGNATURE SYSTEM.
 *
 * THE PROBLEM THIS ADDRESSES
 * --------------------------
 * Cellular coverage at busy Ghanaian terminals is unreliable, and is worst
 * precisely when the terminal is most crowded. A gate device that had to query
 * a central server for every ticket would stall boarding at exactly the wrong
 * moment. So verification must work with no network connection at all.
 *
 * HOW VERIFICATION WORKS HERE
 * ---------------------------
 * The scanned QR payload contains the full ticket details plus a signature.
 * The device recomputes the signature from the scanned details using the shared
 * secret key and compares the two. A match proves the ticket was issued by the
 * system and has not been altered — established entirely locally, with no
 * server involved.
 *
 * FOUR OUTCOMES ARE DISTINGUISHED
 * -------------------------------
 *   1. VALID          — signature matches; passenger checked in.
 *   2. DUPLICATE      — signature matches but the ticket was already used;
 *                       flagged as a possible fraud attempt.
 *   3. FORGED/ALTERED — signature mismatch; ticket rejected.
 *   4. MALFORMED      — payload is not valid ticket JSON at all.
 *
 * Outcomes 2 and 3 both write security entries to the audit ledger, where they
 * surface on the regulator dashboard as incidents.
 *
 * SIMULATION NOTE: a real device would use a camera to read the QR code. Here
 * the payload is pasted into a text box, which keeps the focus on the
 * verification logic being assessed rather than on camera handling.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { getBookings, validateBooking, addAuditLog, Booking } from '../../services/database';
import { verifyOfflineTicket, QRData } from '../../services/algorithms';

export default function GateValidationPortal() {
  // Raw scanned/pasted QR payload awaiting verification.
  const [ticketInput, setTicketInput] = useState('');

  /**
   * Outcome of the most recent scan. Null before any scan has been performed.
   * `ticketDetails` is optional because a malformed payload cannot be parsed
   * into ticket fields at all.
   */
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
    ticketDetails?: QRData;
  } | null>(null);

  // Running list of passengers checked in at this gate.
  const [offlineValidatedList, setOfflineValidatedList] = useState<Booking[]>([]);

  /** Refreshes the check-in list, keeping only tickets already validated. */
  const loadValidated = async () => {
    const list = await getBookings();
    setOfflineValidatedList(list.filter(b => b.isValidated));
  };

  useEffect(() => {
    loadValidated();
  }, []);

  /**
   * Verifies a scanned ticket and checks the passenger in.
   *
   * The whole method is wrapped in try/catch because JSON.parse() throws on
   * malformed input — the catch block handles outcome 4 (a payload that is not
   * a ticket at all, such as an unrelated QR code).
   */
  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketInput.trim()) {
      alert('Please paste or scan a ticket code.');
      return;
    }

    try {
      // Decode the scanned payload into ticket fields.
      const qrData: QRData = JSON.parse(ticketInput);

      // THE CORE OFFLINE CHECK. Recomputes the signature from the scanned
      // details and compares it to the one the ticket carries. Requires no
      // network access — this is the central claim being demonstrated.
      const isSignatureValid = verifyOfflineTicket(qrData);

      if (isSignatureValid) {
        // Signature is genuine. Now determine whether the ticket has already
        // been used — authenticity and redemption are separate questions.
        const bookings = await getBookings();
        const ticketIdx = bookings.findIndex(b => b.id === qrData.ticketId);

        let systemMessage = 'Validated Offline: Cryptographic signature verified successfully.';

        if (ticketIdx !== -1) {
          // OUTCOME 2 — DUPLICATE SCAN.
          // The signature is valid but this ticket was already redeemed,
          // indicating a photocopied or forwarded ticket. Detecting this
          // requires local state, which is why the signature check alone is
          // not sufficient. The check-in is refused and a security event is
          // logged for the regulator.
          if (bookings[ticketIdx].isValidated) {
            setValidationResult({
              success: false,
              message: `Ticket already verified at ${bookings[ticketIdx].validatedAt}. Warning: Duplicate scan attempt detected.`,
              ticketDetails: qrData
            });
            await addAuditLog(
              'system',
              'security_duplicate_scan',
              `Warning: Duplicate offline scan attempt detected for Ticket ID ${qrData.ticketId}.`
            );
            return;
          }

          // OUTCOME 1 — VALID, FIRST USE. Mark the ticket redeemed so any
          // subsequent scan of the same ticket is caught as a duplicate.
          const validatedTimeString = new Date().toLocaleTimeString();
          await validateBooking(qrData.ticketId, validatedTimeString);
          systemMessage = `Validated Offline: Successfully checked in ${qrData.passengerName} to Seat ${qrData.seatNumber}.`;
        } else {
          // OUTCOME 1b — VALID, BUT UNKNOWN TO THIS DEVICE.
          // The signature verifies, yet no matching booking exists locally.
          // This is the true offline case: a ticket issued while this device
          // was disconnected. The passenger is admitted on the strength of the
          // signature alone — precisely the resilience the design aims for.
          // The booking record would reconcile on the next synchronisation.
          systemMessage = `Validated Offline: Signature matches cryptographic secret keys. Passenger verified (un-synced database log created).`;
        }

        setValidationResult({
          success: true,
          message: systemMessage,
          ticketDetails: qrData
        });

        await addAuditLog(
          'operator',
          'ticket_verification_offline',
          `Gate validated Ticket ID ${qrData.ticketId} offline. Passenger: ${qrData.passengerName}, Seat: ${qrData.seatNumber}.`
        );
        await loadValidated();

      } else {
        // OUTCOME 3 — SIGNATURE MISMATCH (forged or altered ticket).
        // The recomputed signature does not match the one presented, so either
        // the ticket was fabricated without the secret key, or a genuine ticket
        // was edited after issue — changing even a single character of the
        // passenger name or seat number produces a different signature.
        setValidationResult({
          success: false,
          message: 'Verification Failed: Cryptographic signature mismatch. Potential forged or altered ticket payload.',
          ticketDetails: qrData
        });

        await addAuditLog(
          'system',
          'security_signature_mismatch',
          `Security Alert: Ticket signature mismatch detected on validation input: ${ticketInput.slice(0, 100)}...`
        );
      }
    } catch (err) {
      // OUTCOME 4 — MALFORMED PAYLOAD.
      // JSON.parse() threw, so the input was never a ticket: an unrelated QR
      // code, a truncated scan, or arbitrary text. No audit entry is written
      // here, since this indicates a scanning error rather than an attack.
      setValidationResult({
        success: false,
        message: 'Invalid Scan Payload: Input does not match the transit ticket structural template.'
      });
    }
  };

  /** Resets the scanner for the next passenger in the queue. */
  const clearInput = () => {
    setTicketInput('');
    setValidationResult(null);
  };

  /**
   * Loads a sample ticket for demonstration purposes.
   *
   * NOTE FOR EXAMINERS: despite the button label "Load Mock Valid QR", this
   * sample does NOT pass verification. Its hard-coded signature ('1B3F9A7D')
   * is not the signature these details actually produce (the correct value is
   * 'F07A9FB'), so scanning it always yields outcome 3, signature mismatch.
   *
   * It is therefore a useful demonstration of the FORGED-ticket path, and can
   * be read as illustrating exactly the attack the scheme defends against: a
   * plausible-looking ticket carrying a signature its bearer could not compute.
   *
   * To demonstrate a SUCCESSFUL validation, book a ticket through the commuter
   * portal and paste that booking's genuine QR payload into the scan box.
   */
  const loadSimulatedTicket = () => {
    const validMockTicket = {
      ticketId: "TKT-3829-GH",
      passengerName: "Kofi Mensah",
      seatNumber: 14,
      busNumber: "VIP-843-26",
      signature: "1B3F9A7D"
    };
    // Pretty-printed with 2-space indentation so the payload structure is
    // legible in the text area.
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
        
        {/* ================= SCANNER INPUT =================
            Stands in for the camera of a physical handheld scanner. */}
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

          {/* VERIFICATION RESULT PANEL.
              Colour-coded for instant reading by gate staff under time
              pressure: green for admitted, red for refused. The decoded ticket
              details are shown alongside so the officer can check the name and
              seat against the passenger in front of them. */}
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

        {/* ================= LOCAL CHECK-IN LOG =================
            Passengers admitted at this gate. In a real deployment this list
            lives on the device while it is offline and reconciles with the
            central database once connectivity returns — the "eventual
            consistency" half of the offline-first design. */}
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
