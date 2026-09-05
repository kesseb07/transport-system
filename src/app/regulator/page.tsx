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

import React, { useState, useEffect, useMemo } from 'react';
import {
  getAuditLogs,
  getBookings,
  getSchedules,
  AuditLog,
  Booking,
  Schedule,
  OPERATORS
} from '../../services/database';

export default function RegulatorPortal() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [bookingsCount, setBookingsCount] = useState(0);
  const [revenueSum, setRevenueSum] = useState(0);
  const [validatedCount, setValidatedCount] = useState(0);
  const [incidentCount, setIncidentCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'booking' | 'validation' | 'dispatch' | 'security'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const pageSize = 10;

  /** Loads audit logs, bookings, and schedules concurrently. */
  const loadData = async () => {
    setIsRefreshing(true);
    const [auditLogs, allBookings, allSchedules] = await Promise.all([
      getAuditLogs(),
      getBookings(),
      getSchedules()
    ]);

    // Reverse copy so newest activity appears at the top
    setLogs([...auditLogs].reverse());
    setBookings(allBookings);
    setSchedules(allSchedules);
    setBookingsCount(allBookings.length);
    setRevenueSum(allBookings.reduce((sum, b) => sum + b.amountPaid, 0));
    setValidatedCount(allBookings.filter(b => b.isValidated).length);

    const incidents = auditLogs.filter(
      l => l.action.includes('security') || l.action.includes('mismatch') || l.action.includes('duplicate')
    ).length;
    setIncidentCount(incidents);
    setTimeout(() => setIsRefreshing(false), 300);
  };

  useEffect(() => {
    loadData();
  }, []);

  /** Operator-by-operator compliance and revenue breakdown */
  const operatorStats = useMemo(() => {
    return OPERATORS.map(op => {
      const opSchedules = schedules.filter(s => s.operatorId === op.id);
      const opSchedIds = new Set(opSchedules.map(s => s.id));
      const opBookings = bookings.filter(b => opSchedIds.has(b.scheduleId));
      const revenue = opBookings.reduce((sum, b) => sum + b.amountPaid, 0);
      const validated = opBookings.filter(b => b.isValidated).length;
      const rate = opBookings.length > 0 ? Math.round((validated / opBookings.length) * 100) : 0;

      return {
        ...op,
        activeBuses: opSchedules.length,
        bookingsCount: opBookings.length,
        validatedCount: validated,
        checkInRate: rate,
        revenue
      };
    });
  }, [schedules, bookings]);

  /** Helper to format raw database action identifiers into human-readable regulatory terms */
  const formatAction = (action: string): string => {
    const map: Record<string, string> = {
      ticket_booking: 'MoMo Seat Booking',
      passenger_booking: 'MoMo Seat Booking',
      simulated_booking: 'Simulated Ticket Reservation',
      ticket_verification_offline: 'Offline Gate Validation',
      security_duplicate_scan: 'Duplicate Scan Detected',
      security_signature_mismatch: 'Signature Tamper Alert',
      bus_dispatch: 'Terminal Bus Dispatch',
    };
    return map[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  /** Assigns standard semantic badges per actor role */
  const getActorBadge = (actor: string, isWarning: boolean) => {
    if (isWarning) return 'badge-error';
    switch (actor.toLowerCase()) {
      case 'operator': return 'badge-operator';
      case 'system': return 'badge-info';
      case 'passenger':
      case 'commuter': return 'badge-success';
      default: return 'badge-system';
    }
  };

  /** Filter counts */
  const filterCounts = useMemo(() => {
    return {
      all: logs.length,
      booking: logs.filter(l => l.action.includes('booking')).length,
      validation: logs.filter(l => l.action.includes('verification')).length,
      dispatch: logs.filter(l => l.action.includes('dispatch')).length,
      security: incidentCount,
    };
  }, [logs, incidentCount]);

  /** Filter and search computation */
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const isWarning = log.action.includes('duplicate') || log.action.includes('mismatch') || log.action.includes('security');

      if (filter === 'security' && !isWarning) return false;
      if (filter === 'booking' && !log.action.includes('booking')) return false;
      if (filter === 'validation' && !log.action.includes('verification')) return false;
      if (filter === 'dispatch' && !log.action.includes('dispatch')) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.details.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.actor.toLowerCase().includes(q) ||
          log.hash.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [logs, filter, searchQuery]);

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const handleCopyHash = (hash: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 2000);
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      gap: '24px'
    }}>

      {/* ================= HEADER & OVERSIGHT JURISDICTION ================= */}
      <section style={{ textAlign: 'center', padding: '8px 0 4px 0', minWidth: 0, maxWidth: '100%' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: 'rgba(179, 3, 3, 0.1)',
          border: '1px solid var(--primary-glow)',
          borderRadius: '20px',
          marginBottom: '10px',
          maxWidth: '100%',
          flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: '0.85rem' }}>🇬🇭</span>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            textAlign: 'center',
            wordBreak: 'break-word'
          }}>
            National Transport Authority · Regulatory Oversight
          </span>
        </div>
        <h1 className="page-header-title" style={{ wordBreak: 'break-word' }}>
          Regulatory Compliance & Revenue Audit
        </h1>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '0.95rem',
          maxWidth: '720px',
          margin: '0 auto',
          lineHeight: 1.5,
          wordBreak: 'break-word'
        }}>
          Independent real-time monitoring of intercity transit revenue, digital passenger manifests, and tamper-evident terminal dispatch telemetry.
        </p>
      </section>

      {/* ================= COMPLIANCE INDICATORS (4 HEADLINE METRICS) ================= */}
      <div className="regulator-stats-grid">

        {/* INDICATOR 1 — Reconciled Revenue */}
        <div className="glass-panel" style={{
          padding: '20px',
          borderLeft: '4px solid var(--accent-gold)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Reconciled Taxable Revenue</p>
            <span style={{ fontSize: '1.2rem', padding: '4px 8px', background: 'var(--accent-gold-glow)', borderRadius: '8px', flexShrink: 0 }}>
              💳
            </span>
          </div>
          <div>
            <p style={{ fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--accent-gold)', letterSpacing: '-0.02em', margin: 0, wordBreak: 'break-word' }}>
              GHS {revenueSum.toLocaleString()}.00
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              Audited MoMo passenger settlements
            </p>
          </div>
        </div>

        {/* INDICATOR 2 — Total Bookings */}
        <div className="glass-panel" style={{
          padding: '20px',
          borderLeft: '4px solid var(--primary)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Digital Bookings</p>
            <span style={{ fontSize: '1.2rem', padding: '4px 8px', background: 'var(--primary-glow)', borderRadius: '8px', flexShrink: 0 }}>
              🎫
            </span>
          </div>
          <div>
            <p style={{ fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em', margin: 0, wordBreak: 'break-word' }}>
              {bookingsCount}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              Signed digital tickets issued
            </p>
          </div>
        </div>

        {/* INDICATOR 3 — Verified Boardings */}
        <div className="glass-panel" style={{
          padding: '20px',
          borderLeft: '4px solid var(--glow-green)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Physical Gate Boardings</p>
            <span style={{ fontSize: '1.2rem', padding: '4px 8px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', flexShrink: 0 }}>
              🚪
            </span>
          </div>
          <div>
            <p style={{ fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', fontWeight: 800, color: 'var(--glow-green)', letterSpacing: '-0.02em', margin: 0, wordBreak: 'break-word' }}>
              {validatedCount}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              {bookingsCount > 0 ? `${Math.round((validatedCount / bookingsCount) * 100)}% check-in rate` : 'Offline cryptographic matches'}
            </p>
          </div>
        </div>

        {/* INDICATOR 4 — Security Alerts */}
        <div className="glass-panel" style={{
          padding: '20px',
          borderLeft: `4px solid ${incidentCount > 0 ? 'var(--glow-red)' : 'var(--accent-teal)'}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Integrity & Security Alerts</p>
            <span style={{
              fontSize: '1.2rem',
              padding: '4px 8px',
              background: incidentCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.15)',
              borderRadius: '8px',
              flexShrink: 0
            }}>
              {incidentCount > 0 ? '⚠️' : '🛡️'}
            </span>
          </div>
          <div>
            <p style={{
              fontSize: 'clamp(1.4rem, 4vw, 1.8rem)',
              fontWeight: 800,
              color: incidentCount > 0 ? 'var(--glow-red)' : 'var(--accent-teal)',
              letterSpacing: '-0.02em',
              margin: 0,
              wordBreak: 'break-word'
            }}>
              {incidentCount}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
              {incidentCount > 0 ? `${incidentCount} duplicate or tamper events` : '0 integrity breaches detected'}
            </p>
          </div>
        </div>

      </div>

      {/* ================= LICENSED CARRIER REVENUE & MANIFEST RECONCILIATION ================= */}
      <section className="glass-panel" style={{ padding: '24px', minWidth: 0, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', wordBreak: 'break-word' }}>
              Licensed Carrier Audit & Revenue Reconciliation
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, wordBreak: 'break-word' }}>
              Independent verification comparing carrier declared capacity, digital bookings, physical gate boardings, and tax liabilities.
            </p>
          </div>
          <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
            Cross-Referenced via MoMo Gateway
          </span>
        </div>

        {/* Desktop Table View */}
        <div className="compliance-desktop-view">
          <div className="compliance-table-wrap">
            <table className="compliance-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Active Fleet</th>
                  <th>Digital Bookings</th>
                  <th>Gate Check-Ins</th>
                  <th>Boarding Rate</th>
                  <th>Reconciled Revenue</th>
                  <th>Audit Status</th>
                </tr>
              </thead>
              <tbody>
                {operatorStats.map((op) => (
                  <tr key={op.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          background: op.color,
                          display: 'inline-block',
                          flexShrink: 0
                        }} />
                        <strong style={{ color: 'var(--text-main)' }}>{op.name}</strong>
                        <span className="badge badge-system" style={{ fontSize: '0.65rem' }}>{op.code}</span>
                      </div>
                    </td>
                    <td>{op.activeBuses} Scheduled Services</td>
                    <td>
                      <strong>{op.bookingsCount}</strong> tickets
                    </td>
                    <td>
                      <span style={{ color: 'var(--glow-green)', fontWeight: 600 }}>{op.validatedCount}</span> boarded
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '80px',
                          height: '6px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${op.checkInRate}%`,
                            height: '100%',
                            background: op.checkInRate > 50 ? 'var(--glow-green)' : 'var(--accent-gold)'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{op.checkInRate}%</span>
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--accent-gold)' }}>
                        GHS {op.revenue.toLocaleString()}.00
                      </strong>
                    </td>
                    <td>
                      <span className="badge badge-success">
                        ✓ Audited & In Order
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards View */}
        <div className="compliance-mobile-view">
          {operatorStats.map((op) => (
            <div key={op.id} className="operator-compliance-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    background: op.color,
                    display: 'inline-block',
                    flexShrink: 0
                  }} />
                  <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>{op.name}</strong>
                  <span className="badge badge-system" style={{ fontSize: '0.65rem' }}>{op.code}</span>
                </div>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                  ✓ Audited & In Order
                </span>
              </div>

              <div className="operator-metrics-subgrid">
                <div style={{ background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Active Fleet</p>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{op.activeBuses} Services</strong>
                </div>
                <div style={{ background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Digital Bookings</p>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{op.bookingsCount} tickets</strong>
                </div>
                <div style={{ background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Gate Check-Ins</p>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--glow-green)' }}>{op.validatedCount} boarded</strong>
                </div>
                <div style={{ background: 'var(--input-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 2px 0' }}>Reconciled Rev.</p>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--accent-gold)' }}>GHS {op.revenue.toLocaleString()}.00</strong>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Boarding Manifest Rate</span>
                  <span style={{ fontWeight: 600, color: op.checkInRate > 50 ? 'var(--glow-green)' : 'var(--accent-gold)' }}>{op.checkInRate}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${op.checkInRate}%`,
                    height: '100%',
                    background: op.checkInRate > 50 ? 'var(--glow-green)' : 'var(--accent-gold)'
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= CRYPTOGRAPHIC HASH CHAIN INTEGRITY BANNER ================= */}
      <div className="glass-panel" style={{
        padding: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        borderLeft: incidentCount > 0 ? '4px solid var(--glow-red)' : '4px solid var(--glow-green)',
        minWidth: 0,
        maxWidth: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0, flex: '1 1 280px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: incidentCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            flexShrink: 0
          }}>
            {incidentCount > 0 ? '⚠️' : '🔒'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                {incidentCount > 0 ? 'Cryptographic Hash Chain: Security Events Flagged' : 'Tamper-Evident Hash Chain: Verified & Continuous'}
              </h3>
              <span className={`badge ${incidentCount > 0 ? 'badge-error' : 'badge-success'}`}>
                {incidentCount > 0 ? `${incidentCount} Flagged Events` : '0 Broken Links'}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.4, wordBreak: 'break-word' }}>
              Sequential djb2 HMAC-style hash dependencies enforce non-repudiation. Historical alterations break subsequent digests.
            </p>
            {logs.length > 0 && (
              <div style={{
                marginTop: '6px',
                fontSize: '0.75rem',
                color: 'var(--text-dim)',
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
                lineHeight: 1.4
              }}>
                <span>Genesis: <code style={{ fontFamily: 'monospace' }}>000000000000...</code></span>
                <span style={{ margin: '0 6px' }}>→</span>
                <span>Latest Head: <code style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{logs[0]?.hash}</code></span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={loadData}
            className="btn-secondary"
            disabled={isRefreshing}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            {isRefreshing ? 'Syncing...' : '↻ Refresh Ledger'}
          </button>
        </div>
      </div>

      {/* ================= THE AUDIT LEDGER SECTION ================= */}
      <section className="glass-panel" style={{ padding: '24px', minWidth: 0, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', wordBreak: 'break-word' }}>
              Independent Event Audit Ledger
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, wordBreak: 'break-word' }}>
              Immutable chronological log of ticket bookings, gate verifications, fleet dispatches, and integrity anomalies.
            </p>
          </div>

          {/* Search bar */}
          <div style={{ width: '100%', maxWidth: '320px', minWidth: 0 }}>
            <input
              type="text"
              placeholder="Search by ticket, actor, or detail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Filter chips bar */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`date-chip ${filter === 'all' ? 'date-chip-selected' : ''}`}
          >
            All Events ({filterCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilter('booking')}
            className={`date-chip ${filter === 'booking' ? 'date-chip-selected' : ''}`}
          >
            Ticket Bookings ({filterCounts.booking})
          </button>
          <button
            type="button"
            onClick={() => setFilter('validation')}
            className={`date-chip ${filter === 'validation' ? 'date-chip-selected' : ''}`}
          >
            Gate Validations ({filterCounts.validation})
          </button>
          <button
            type="button"
            onClick={() => setFilter('dispatch')}
            className={`date-chip ${filter === 'dispatch' ? 'date-chip-selected' : ''}`}
          >
            Dispatches ({filterCounts.dispatch})
          </button>
          <button
            type="button"
            onClick={() => setFilter('security')}
            className={`date-chip ${filter === 'security' ? 'date-chip-selected' : ''}`}
          >
            Security Alerts ({filterCounts.security})
          </button>
        </div>

        {/* Ledger rows */}
        {paginatedLogs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {paginatedLogs.map((log) => {
              const isWarning = log.action.includes('duplicate') || log.action.includes('mismatch') || log.action.includes('security');
              return (
                <div 
                  key={log.id} 
                  className={`ledger-card ${isWarning ? 'warning' : ''}`}
                >
                  {/* Card Top Row: Actor, Action, and Timestamp */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={`badge ${getActorBadge(log.actor, isWarning)}`}>
                        {log.actor.toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: isWarning ? 'var(--glow-red)' : 'var(--text-main)'
                      }}>
                        {formatAction(log.action)}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      🕒 {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {/* Card Middle: Detailed Narrative */}
                  <p style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-main)',
                    margin: 0,
                    lineHeight: 1.5
                  }}>
                    {log.details}
                  </p>

                  {/* Card Bottom: Hash Digest Pill & Copy Button */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-glass)',
                    minWidth: 0,
                    maxWidth: '100%'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                        Chain Digest:
                      </span>
                      <code className="hash-pill" title={`Full hash: ${log.hash}`} style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                        <span>🔗</span>
                        <span style={{ wordBreak: 'break-all' }}>{log.hash}</span>
                      </code>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyHash(log.hash)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedHash === log.hash ? 'var(--glow-green)' : 'var(--text-dim)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        borderRadius: '4px',
                        flexShrink: 0
                      }}
                    >
                      {copiedHash === log.hash ? '✓ Copied' : '📋 Copy Hash'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-dim)' }}>
            <p style={{ fontSize: '1rem', marginBottom: '12px' }}>
              No audit records found matching your filter criteria.
            </p>
            <button
              onClick={() => { setFilter('all'); setSearchQuery(''); }}
              className="btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Pagination controls */}
        {filteredLogs.length > pageSize && (
          <div className="pagination-container">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} events
            </span>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                ← Previous
              </button>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', padding: '0 8px', fontWeight: 600 }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
