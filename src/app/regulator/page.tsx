/**
 * ============================================================================
 * regulator/page.tsx — REGULATORY COMPLIANCE DASHBOARD (route: /regulator)
 * ============================================================================
 *
 * The transport authority's oversight view, and the third stakeholder
 * perspective in the system (alongside passenger and operator).
 *
 * THE PROBLEM THIS ADDRESSES — REVENUE LEAKAGE
 * --------------------------------------------
 * Under paper ticketing, operators self-report their takings and regulators
 * have no independent means of checking them. Fares can go unrecorded between
 * the passenger paying and the revenue being declared, so the sums are neither
 * fully collected nor fully taxed. Manual auditing is slow and easily
 * frustrated by incomplete records.
 *
 * THE APPROACH
 * ------------
 * Every consequential action anywhere in the system — a booking, a dispatch, a
 * gate scan, a failed verification — writes an entry to a shared audit ledger
 * as it happens. This page reads that ledger and presents:
 *
 *   - four aggregate indicators (revenue, bookings, boardings, incidents);
 *   - the full chronological event ledger, with the hash linking each entry to
 *     the one before it, so retrospective alteration becomes detectable.
 *
 * The regulator therefore sees the same records the operator does, generated
 * automatically rather than self-reported.
 *
 * READ-ONLY BY DESIGN: this page offers no controls that modify data. A
 * regulator observes; it does not operate the service. That constraint is also
 * what makes the ledger credible as evidence.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { getAuditLogs, getBookings, AuditLog } from '../../services/database';

export default function RegulatorPortal() {
  const [logs, setLogs] = useState<AuditLog[]>([]);          // ledger entries, newest first for display
  const [bookingsCount, setBookingsCount] = useState(0);     // total tickets sold
  const [revenueSum, setRevenueSum] = useState(0);           // total fares, for tax reconciliation
  const [validatedCount, setValidatedCount] = useState(0);   // passengers who actually boarded
  const [incidentCount, setIncidentCount] = useState(0);     // security events requiring attention

  /** Loads the ledger and computes the four headline compliance indicators. */
  const loadData = async () => {
    const auditLogs = await getAuditLogs();

    // Stored oldest-first because the hash chain must be built and verified in
    // that order; reversed here purely for display, so recent activity appears
    // at the top. A COPY is reversed ([...auditLogs]) because Array.reverse()
    // mutates in place and would otherwise corrupt the chain ordering.
    setLogs([...auditLogs].reverse());

    const allBookings = await getBookings();
    setBookingsCount(allBookings.length);

    // Independently computed revenue total — the figure that can be compared
    // against the operator's own declaration to expose under-reporting.
    setRevenueSum(allBookings.reduce((sum, b) => sum + b.amountPaid, 0));

    // Tickets sold versus passengers actually boarded. A persistent gap
    // between these two figures is itself a signal worth investigating.
    setValidatedCount(allBookings.filter(b => b.isValidated).length);

    // Incident detection by keyword. The gate scanner writes actions such as
    // 'security_duplicate_scan' and 'security_signature_mismatch', so matching
    // these substrings surfaces fraud attempts without needing a separate
    // incident table.
    const incidents = auditLogs.filter(
      l => l.action.includes('security') || l.action.includes('mismatch') || l.action.includes('duplicate')
    ).length;
    setIncidentCount(incidents);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
      
      <section style={{ textAlign: 'center', padding: '16px 0' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '8px', background: 'linear-gradient(135deg, #f3f4f6 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Regulatory Compliance Audit Log
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Real-time independent monitoring of fare transactions, manifest integrity, and terminal dispatches
        </p>
      </section>

      {/* ================= COMPLIANCE INDICATORS =================
          Four figures giving an at-a-glance regulatory picture: money
          collected, tickets sold, passengers boarded, and incidents raised. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>

        {/* INDICATOR 1 — revenue, computed independently of operator
            self-reporting. This is the direct counter to revenue leakage. */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Taxable Revenue Reconciled</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-gold)' }}>GHS {revenueSum}.00</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>Automated MoMo settlements</p>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Ticket Bookings</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)' }}>{bookingsCount}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>Across all verified operators</p>
        </div>

        {/* INDICATOR 3 — passengers who actually boarded. Compared against
            indicator 2, the difference reveals no-shows or unscanned entry. */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Verified Passenger Boardings</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--glow-green)' }}>{validatedCount}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>Offline QR validation match</p>
        </div>

        {/* INDICATOR 4 — fraud attempts caught at the gate. The whole card
            turns red when any incident exists, so it cannot be overlooked. */}
        <div className="glass-panel" style={{ padding: '20px', borderColor: incidentCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-glass)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Incidents / Alerts Triggered</p>
          <p style={{ 
            fontSize: '1.8rem', 
            fontWeight: 700, 
            color: incidentCount > 0 ? 'var(--glow-red)' : 'var(--text-main)' 
          }}>
            {incidentCount}
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>Tampering or duplicates</p>
        </div>

      </div>

      {/* ================= THE AUDIT LEDGER =================
          Every recorded event, newest first. Each row displays the actor and
          action, a description, and the hash binding it to the preceding
          entry. Security events are outlined in red. The visible hash chain is
          the point of this section: altering any historical entry breaks the
          links that follow it, making tampering evident to an auditor. */}
      <section className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Independent Monitoring Ledger</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Each transaction and dispatch event produces a linked audit payload. The SHA-style hash link chain prevents historical alteration of manifests and revenue logs.
        </p>

        {logs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {logs.map((log) => {
              const isWarning = log.action.includes('duplicate') || log.action.includes('mismatch') || log.action.includes('security');
              return (
                <div 
                  key={log.id} 
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid',
                    borderColor: isWarning ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-glass)',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 4fr 2fr',
                    gap: '16px',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span 
                      className={`badge ${isWarning ? 'badge-error' : 'badge-success'}`}
                      style={{ marginTop: '4px' }}
                    >
                      {log.actor} - {log.action}
                    </span>
                  </div>
                  
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    {log.details}
                  </p>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>
                      Verification Hash Chain Link:
                    </span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontFamily: 'monospace', 
                      color: 'var(--text-muted)',
                      wordBreak: 'break-all'
                    }}>
                      {log.hash}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
            No audit trails recorded in the ledger database.
          </div>
        )}
      </section>

    </div>
  );
}
