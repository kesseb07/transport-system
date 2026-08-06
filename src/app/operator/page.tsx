/**
 * ============================================================================
 * operator/page.tsx — OPERATOR DISPATCH CONTROL PANEL (route: /operator)
 * ============================================================================
 *
 * The bus company's internal dashboard, and the primary demonstration of the
 * LEAKY BUCKET DISPATCH ALGORITHM. Where the commuter portal shows the
 * passenger's view of the system, this page shows the operational view: how
 * full each bus is, how quickly it is filling, and when it should depart.
 *
 * It supports three activities:
 *
 *   1. MONITOR  — live leaky bucket metrics for a chosen bus: booking
 *                 velocity, projected departure time, and terminal congestion.
 *   2. SIMULATE — an interactive control set (a velocity slider and a button
 *                 that adds bookings) allowing the dispatch model to be
 *                 exercised on demand rather than waiting for real passengers.
 *                 This exists specifically so the algorithm's behaviour can be
 *                 demonstrated and examined.
 *   3. DISPATCH — marking a bus as departed, i.e. "leaking" the bucket, and
 *                 reviewing the passenger manifest and fare reconciliation.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Schedule,
  Booking,
  getSchedules,
  saveSchedule,
  getBookings,
  addBooking,
  addAuditLog,
  OPERATORS
} from '../../services/database';
import { runLeakyBucketSimulation } from '../../services/algorithms';

export default function OperatorPanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);          // every bus in the fleet
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(''); // bus under inspection
  /**
   * Passenger arrival rate in bookings per hour, controlled by the slider.
   * This is the key experimental variable: raising it shortens the projected
   * departure, demonstrating how the model adapts to demand.
   */
  const [velocity, setVelocity] = useState<number>(30);
  const [bookings, setBookings] = useState<Booking[]>([]);             // all bookings, filtered per bus below

  /** Reloads both datasets. Called on mount and after every state change. */
  const loadData = async () => {
    const schs = await getSchedules();
    const bks = await getBookings();
    setSchedules(schs);
    setBookings(bks);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleVelocityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Range inputs yield strings, so an explicit numeric conversion is needed
    // before the value can be used in the model's arithmetic.
    setVelocity(Number(e.target.value));
  };

  // Derived values, recomputed on each render rather than stored in state.
  // Keeping them derived guarantees they can never fall out of sync with the
  // underlying data.
  const currentSchedule = schedules.find(s => s.id === selectedScheduleId);
  const matchedBookings = bookings.filter(b => b.scheduleId === selectedScheduleId);

  /**
   * Runs the leaky bucket model for the selected bus.
   *
   * Because runLeakyBucketSimulation is a pure function, this can safely be
   * re-executed on every render. That is what makes the slider feel live: each
   * movement triggers a re-render, which re-runs the model and immediately
   * updates the projected departure time.
   */
  const leakyBucketData = currentSchedule
    ? runLeakyBucketSimulation(currentSchedule, velocity)
    : null;

  /**
   * Adds one synthetic passenger to the selected bus — the "fill the bucket"
   * control.
   *
   * PURPOSE: the leaky bucket model's behaviour only becomes visible as the
   * bucket fills. Rather than requiring dozens of manual bookings through the
   * commuter portal to reach the 85% dispatch threshold, this button injects
   * bookings directly, making the model demonstrable in seconds.
   */
  const addSimulatedBooking = async () => {
    if (!currentSchedule) return;

    // Capacity check: the bucket cannot exceed its physical size.
    if (currentSchedule.reservedSeats.length >= currentSchedule.totalSeats) {
      alert('Bus is completely full.');
      return;
    }

    // Allocate the lowest-numbered free seat, filling the bus front to back.
    let seatNum = 1;
    while (currentSchedule.reservedSeats.includes(seatNum)) {
      seatNum++;
    }

    // 'SIM-' prefixes distinguish simulated records from genuine passenger
    // bookings in the manifest and the audit ledger — important for keeping
    // demonstration data identifiable in the results.
    const tktId = `SIM-${Date.now().toString().slice(-6)}-GH`;
    const mockMomoId = `SIM-MOM-${Math.floor(100000 + Math.random() * 900000)}`;
    // Same hard-coded fare shortcut noted in the commuter portal; it should
    // read from the ROUTES reference table instead.
    const fare = currentSchedule.routeId === 'rt-acc-kum' ? 120 : currentSchedule.routeId === 'rt-acc-tam' ? 240 : 100;

    // Simulated bookings carry a placeholder rather than a real signature.
    // This is deliberate: presenting one of these at the gate scanner fails
    // verification, which conveniently demonstrates the forged-ticket path.
    const mockSignature = 'SIMULATED-OFFLINE-SIGNATURE';
    const qrPayload = JSON.stringify({
      ticketId: tktId,
      passengerName: `Passenger ${seatNum}`,
      seatNumber: seatNum,
      busNumber: currentSchedule.busNumber,
      signature: mockSignature
    });

    const newBooking: Booking = {
      id: tktId,
      scheduleId: currentSchedule.id,
      passengerName: `Passenger ${seatNum}`,
      passengerPhone: `024${Math.floor(1000000 + Math.random() * 9000000)}`,
      seatNumber: seatNum,
      momoProvider: 'MTN',
      momoTransactionId: mockMomoId,
      amountPaid: fare,
      timestamp: new Date().toISOString(),
      qrPayload,
      isValidated: false
    };

    const updatedSeats = [...currentSchedule.reservedSeats, seatNum];

    // AUTOMATIC STATUS TRANSITION — the leaky bucket threshold in action.
    // On crossing 85% capacity the bus advances from 'scheduled' to 'boarding'
    // without operator intervention. This is the algorithm driving real
    // operational state rather than merely reporting a number, and it matches
    // the 85% leakThreshold used inside runLeakyBucketSimulation().
    let updatedStatus = currentSchedule.status;
    if (updatedSeats.length >= Math.floor(currentSchedule.totalSeats * 0.85)) {
      updatedStatus = 'boarding';
    }

    const updatedSchedule: Schedule = {
      ...currentSchedule,
      reservedSeats: updatedSeats,
      status: updatedStatus
    };

    await addBooking(newBooking);
    await saveSchedule(updatedSchedule);
    await addAuditLog(
      'system',
      'simulated_booking',
      `Accumulated simulated booking on Schedule ${currentSchedule.id}. Bucket level is now ${updatedSeats.length}/${currentSchedule.totalSeats}.`
    );

    await loadData();
  };

  /**
   * Dispatches the bus — the "leak the bucket" action.
   *
   * In the model this is the leak event: the accumulated passengers depart the
   * terminal, and the congestion they represented is relieved. The dispatch is
   * recorded in the audit ledger so the regulator has an independent record of
   * when each service actually left.
   *
   * DESIGN NOTE: dispatch remains a manual operator decision rather than firing
   * automatically at the threshold. The algorithm advises; the human decides.
   * This reflects operational reality — a driver may wait for a known incoming
   * group, or leave early on a public holiday — and keeps the system a
   * decision-support tool rather than an autonomous controller.
   */
  const triggerDispatch = async () => {
    if (!currentSchedule) return;

    const updatedSchedule: Schedule = {
      ...currentSchedule,
      status: 'departed'
    };

    await saveSchedule(updatedSchedule);
    await addAuditLog(
      'operator',
      'bus_dispatch',
      `Operator triggered manual dispatch for Bus ${currentSchedule.busNumber}. Congestion resolved for route.`
    );

    await loadData();
  };

  /**
   * Sums the fares collected for this bus.
   *
   * This is the financial reconciliation figure: an automatically computed
   * total that operators previously had to tally by hand from paper tickets, a
   * manual step that created the opportunity for revenue leakage.
   */
  const totalRevenue = matchedBookings.reduce((sum, b) => sum + b.amountPaid, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
      
      <section style={{ textAlign: 'center', padding: '16px 0' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '8px', background: 'linear-gradient(135deg, #f3f4f6 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Operator Dispatch Control Panel
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Manage terminal fleets, monitor passenger accumulation velocity, and dispatch schedules
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)', gap: '24px', alignItems: 'start' }}>
        
        {/* ================= FLEET LIST =================
            Every bus in the timetable, each showing its operator, current
            status badge and fill level. Selecting one loads its metrics. */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Select Active Fleet Route</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {schedules.map(sch => {
              const op = OPERATORS.find(o => o.id === sch.operatorId);
              const isSelected = sch.id === selectedScheduleId;
              
              return (
                <button
                  key={sch.id}
                  onClick={() => setSelectedScheduleId(sch.id)}
                  style={{
                    background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid',
                    borderColor: isSelected ? 'var(--primary)' : 'var(--border-glass)',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'left',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: op?.color }}>{op?.name}</span>
                    <span className={`badge ${sch.status === 'departed' ? 'badge-success' : 'badge-momo'}`}>
                      {sch.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bus: {sch.busNumber}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Bookings: {sch.reservedSeats.length} / {sch.totalSeats}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {currentSchedule && leakyBucketData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <section className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>
                Algorithmic Queue Status: Leaky Bucket Metrics
              </h2>

              {/* Three headline metrics, read directly from the algorithm's
                  output: inflow rate, projected departure, and congestion. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {/* METRIC 1 — inflow rate driving the model. */}
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Arrival Velocity</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    {velocity} pax/hr
                  </p>
                </div>
                
                {/* METRIC 2 — the model's core output: a departure estimate
                    derived from demand rather than a fixed timetable. */}
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Est. Departure Time</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {leakyBucketData.estimatedMinutesToDeparture === 0 ? 'Ready to leak' : `In ${leakyBucketData.estimatedMinutesToDeparture} mins`}
                  </p>
                </div>

                {/* METRIC 3 — congestion, colour-coded as a traffic light so
                    crowding is readable at a glance:
                      green  (<= 50%) comfortable
                      amber  (> 50%)  filling up
                      red    (> 80%)  congested, dispatch soon */}
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Terminal Congestion Index</p>
                  <p style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: leakyBucketData.congestionIndex > 0.8 ? 'var(--glow-red)' : leakyBucketData.congestionIndex > 0.5 ? 'var(--accent-gold)' : 'var(--glow-green)'
                  }}>
                    {Math.round(leakyBucketData.congestionIndex * 100)}%
                  </p>
                </div>
              </div>

              {/* VELOCITY SLIDER — the experimental control.
                  Moving it changes the modelled inflow rate (5-120 passengers
                  per hour) and the departure estimate updates immediately,
                  making the relationship between demand and dispatch timing
                  directly observable. */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  Simulated Passenger Arrival Rate (Velocity slider):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input 
                    type="range" 
                    min={5} 
                    max={120} 
                    value={velocity} 
                    onChange={handleVelocityChange}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '1rem', fontWeight: 600, width: '80px', textAlign: 'right' }}>
                    {velocity} pax/hr
                  </span>
                </div>
              </div>

              {/* BUCKET LEVEL VISUALISATION — the leaky bucket rendered
                  literally as a filling progress bar, with the 85% leak
                  threshold stated beneath it. */}
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Passenger Accumulation Bucket Level:</span>
                  <span>{currentSchedule.reservedSeats.length} / {currentSchedule.totalSeats} seats booked</span>
                </p>
                <div style={{ width: '100%', height: '14px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                  <div style={{ 
                    width: `${(currentSchedule.reservedSeats.length / currentSchedule.totalSeats) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--primary) 0%, var(--accent-gold) 100%)',
                    transition: 'width 0.5s ease-in-out'
                  }} />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Bucket Leak Threshold (85% standard dispatch): {leakyBucketData.leakThreshold} passengers.
                </p>
              </div>

              {/* The two model actions: fill the bucket, or leak it. */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <button onClick={addSimulatedBooking} className="btn-secondary" style={{ flex: 1 }}>
                  Simulate Ticketing (Fill Bucket)
                </button>
                <button 
                  onClick={triggerDispatch} 
                  disabled={currentSchedule.status === 'departed'}
                  className="btn-primary" 
                  style={{ flex: 1 }}
                >
                  Dispatch Bus (Leak Bucket)
                </button>
              </div>
            </section>

            {/* ================= PASSENGER MANIFEST =================
                The digital replacement for the handwritten boarding list.
                Each row shows the seat, ticket ID, passenger, payment
                reference and whether the passenger has passed the gate — so
                the driver can see at a glance who has boarded and who is
                still expected. The fare total above it is reconciled
                automatically from the same records. */}
            <section className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Passenger Manifest</h2>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Financial Reconciliation</p>
                  <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    Total Fares: GHS {totalRevenue}.00
                  </p>
                </div>
              </div>

              {matchedBookings.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px 8px' }}>Seat</th>
                        <th style={{ padding: '12px 8px' }}>Ticket ID</th>
                        <th style={{ padding: '12px 8px' }}>Passenger Name</th>
                        <th style={{ padding: '12px 8px' }}>Transaction Code</th>
                        <th style={{ padding: '12px 8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedBookings.map(bk => (
                        <tr key={bk.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                          <td style={{ padding: '12px 8px', fontWeight: 600 }}>{bk.seatNumber}</td>
                          <td style={{ padding: '12px 8px', fontFamily: 'monospace' }}>{bk.id}</td>
                          <td style={{ padding: '12px 8px' }}>{bk.passengerName}</td>
                          <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{bk.momoTransactionId}</td>
                          <td style={{ padding: '12px 8px' }}>
                            <span className={`badge ${bk.isValidated ? 'badge-success' : 'badge-momo'}`}>
                              {bk.isValidated ? 'Validated' : 'Pending Gate'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                  No reservations are currently recorded on this schedule manifest.
                </div>
              )}
            </section>

          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Select an active fleet route from the list on the left to load operational dispatch metrics and passenger manifests.
          </div>
        )}

      </div>
    </div>
  );
}
