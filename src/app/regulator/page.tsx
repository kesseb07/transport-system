'use client';

import React, { useState, useEffect } from 'react';
import { getAuditLogs, getBookings, AuditLog } from '../../services/database';

export default function RegulatorPortal() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [revenueSum, setRevenueSum] = useState(0);
  const [validatedCount, setValidatedCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);

  const loadData = async () => {
    const auditLogs = await getAuditLogs();
    setLogs([...auditLogs].reverse());

    const allBookings = await getBookings();
    setBookingsCount(allBookings.length);
    setRevenueSum(allBookings.reduce((sum, b) => sum + b.amountPaid, 0));
    setValidatedCount(allBookings.filter(b => b.isValidated).length);
    
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        
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

        <div className="glass-panel" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Verified Passenger Boardings</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--glow-green)' }}>{validatedCount}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>Offline QR validation match</p>
        </div>

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
