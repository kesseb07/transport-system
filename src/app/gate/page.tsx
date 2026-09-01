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

import React, { useState, useEffect, useRef } from 'react';
import { getBookings, validateBooking, addAuditLog, Booking } from '../../services/database';
import { verifyOfflineTicket, QRData } from '../../services/algorithms';
import { Html5Qrcode } from 'html5-qrcode';

export default function GateValidationPortal() {
  // Raw scanned/pasted QR payload awaiting verification.
  const [ticketInput, setTicketInput] = useState('');

  // Camera scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScannedPayload, setLastScannedPayload] = useState<string | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

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

  /**
   * Play an audible confirmation beep on successful scan
   */
  const playBeep = (isSuccess: boolean) => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (isSuccess) {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.1); // D6
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch {
      // Audio context might be restricted before user gesture; safe to ignore
    }
  };

  /**
   * Renders a stored check-in instant as a readable clock time.
   */
  const formatCheckInTime = (value?: string): string => {
    if (!value) return '';
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString();
  };

  /** Refreshes the check-in list, keeping only tickets already validated. */
  const loadValidated = async () => {
    const list = await getBookings();
    setOfflineValidatedList(list.filter(b => b.isValidated));
  };

  useEffect(() => {
    loadValidated();

    // Cleanup scanner if unmounted
    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  /**
   * Core Verification Logic.
   * Can be called by manual form submit or directly from the camera scanner.
   */
  const processValidation = async (rawInput: string) => {
    const trimmedInput = rawInput.trim();
    if (!trimmedInput) {
      alert('Please paste or scan a ticket code.');
      return;
    }

    try {
      // Decode the scanned payload into ticket fields.
      const qrData: QRData = JSON.parse(trimmedInput);

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
          if (bookings[ticketIdx].isValidated) {
            playBeep(false);
            setValidationResult({
              success: false,
              message: `Ticket already verified at ${formatCheckInTime(bookings[ticketIdx].validatedAt)}. Warning: Duplicate scan attempt detected.`,
              ticketDetails: qrData
            });
            await addAuditLog(
              'system',
              'security_duplicate_scan',
              `Warning: Duplicate offline scan attempt detected for Ticket ID ${qrData.ticketId}.`
            );
            return;
          }

          // OUTCOME 1 — VALID, FIRST USE.
          const validatedTimeString = new Date().toISOString();
          await validateBooking(qrData.ticketId, validatedTimeString);
          systemMessage = `Validated Offline: Successfully checked in ${qrData.passengerName} to Seat ${qrData.seatNumber}.`;
        } else {
          // OUTCOME 1b — VALID, BUT UNKNOWN TO THIS DEVICE (offline sync).
          systemMessage = `Validated Offline: Signature matches cryptographic secret keys. Passenger verified (un-synced database log created).`;
        }

        playBeep(true);
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
        playBeep(false);
        setValidationResult({
          success: false,
          message: 'Verification Failed: Cryptographic signature mismatch. Potential forged or altered ticket payload.',
          ticketDetails: qrData
        });

        await addAuditLog(
          'system',
          'security_signature_mismatch',
          `Security Alert: Ticket signature mismatch detected on validation input: ${trimmedInput.slice(0, 100)}...`
        );
      }
    } catch {
      // OUTCOME 4 — MALFORMED PAYLOAD.
      playBeep(false);
      setValidationResult({
        success: false,
        message: 'Invalid Scan Payload: Input does not match the transit ticket structural template.'
      });
    }
  };

  /** Form submit wrapper */
  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    await processValidation(ticketInput);
  };

  /** Starts the live camera scanner */
  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraActive(true);

    // Give DOM time to render the scanner container
    setTimeout(async () => {
      try {
        if (!qrScannerRef.current) {
          qrScannerRef.current = new Html5Qrcode('qr-reader-container');
        }

        const qrCodeSuccessCallback = async (decodedText: string) => {
          // Prevent rapid double-triggering on the exact same scan frame
          if (decodedText === lastScannedPayload) return;
          setLastScannedPayload(decodedText);
          setTicketInput(decodedText);

          // Automatically process verification
          await processValidation(decodedText);

          // Auto-clear last scanned latch after 2.5 seconds to allow subsequent scans
          setTimeout(() => setLastScannedPayload(null), 2500);
        };

        const config = {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await qrScannerRef.current.start(
          { facingMode: 'environment' },
          config,
          qrCodeSuccessCallback,
          () => {} // Silent on non-detect frames
        );
      } catch (err: unknown) {
        console.error('Camera initialization error:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setCameraError(
          errMsg.includes('Permission') || errMsg.includes('NotAllowedError')
            ? 'Camera access permission was denied. Please allow camera access in your browser settings.'
            : 'Could not access device camera. Please make sure a camera is attached and not in use by another app.'
        );
        setIsCameraActive(false);
      }
    }, 150);
  };

  /** Stops the live camera scanner */
  const stopCameraScanner = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
      } catch (err) {
        console.error('Failed to stop camera scanner:', err);
      }
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  /** Resets the scanner for the next passenger in the queue. */
  const clearInput = () => {
    setTicketInput('');
    setValidationResult(null);
    setLastScannedPayload(null);
  };

  /**
   * Loads a sample ticket for demonstration purposes.
   */
  const loadSimulatedTicket = () => {
    const validMockTicket = {
      ticketId: "TKT-3829-GH",
      passengerName: "Kofi Mensah",
      seatNumber: 14,
      busNumber: "VIP-843-26",
      signature: "1B3F9A7D"
    };
    setTicketInput(JSON.stringify(validMockTicket, null, 2));
  };


  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
      
      <section style={{ textAlign: 'center', padding: '16px 0' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '8px', color: 'var(--text-main)' }}>
          Gate Validation Scanner Portal
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Scan, decrypt, and verify tickets completely offline using local cryptographic key matches
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* ================= SCANNER INPUT =================
            Provides both live camera scanning and manual payload input. */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Gate Scanner</h2>
            <button
              type="button"
              onClick={isCameraActive ? stopCameraScanner : startCameraScanner}
              style={{
                background: isCameraActive ? 'rgba(239, 68, 68, 0.2)' : 'linear-gradient(135deg, var(--primary) 0%, #d97706 100%)',
                color: '#fff',
                border: isCameraActive ? '1px solid var(--glow-red)' : 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              {isCameraActive ? '⏹ Stop Camera' : '📷 Open Camera Scanner'}
            </button>
          </div>

          {/* Camera Error Message */}
          {cameraError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--glow-red)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '0.85rem',
              color: '#fca5a5'
            }}>
              ⚠️ {cameraError}
            </div>
          )}

          {/* Live Video Camera Viewfinder */}
          {isCameraActive && (
            <div style={{
              marginBottom: '20px',
              padding: '12px',
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: '12px',
              border: '2px solid var(--accent-gold)',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', marginBottom: '8px', fontWeight: 600 }}>
                🎯 Point camera directly at the passenger's QR code (Auto-scans & verifies)
              </p>
              <div
                id="qr-reader-container"
                style={{
                  width: '100%',
                  maxWidth: '360px',
                  margin: '0 auto',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              />
            </div>
          )}
          
          <form onSubmit={handleValidate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Scanned QR Payload String:</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Auto-populated on camera scan</span>
              </label>
              <textarea
                rows={5}
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
                    Checked In {item.validatedAt ? `@ ${formatCheckInTime(item.validatedAt)}` : ''}
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
