'use client';

import React, { useState, useEffect } from 'react';
import {
  Schedule,
  Booking,
  getSchedules,
  saveSchedules,
  getBookings,
  saveBookings,
  addAuditLog,
  OPERATORS
} from '../../services/database';
import { runLeakyBucketSimulation } from '../../services/algorithms';

export default function OperatorPanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [velocity, setVelocity] = useState<number>(30); // 30 bookings per hour baseline
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    setSchedules(getSchedules());
    setBookings(getBookings());
  }, []);

  const handleVelocityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVelocity(Number(e.target.value));
  };

  const currentSchedule = schedules.find(s => s.id === selectedScheduleId);
  const matchedBookings = bookings.filter(b => b.scheduleId === selectedScheduleId);

  // Run Leaky Bucket calculation
  const leakyBucketData = currentSchedule 
    ? runLeakyBucketSimulation(currentSchedule, velocity)
    : null;

  // Simulate bookings to fill bucket (simulate passenger accumulation)
  const addSimulatedBooking = () => {
    if (!currentSchedule) return;
    if (currentSchedule.reservedSeats.length >= currentSchedule.totalSeats) {
      alert('Bus is completely full.');
      return;
    }

    // Find first available seat number
    let seatNum = 1;
    while (currentSchedule.reservedSeats.includes(seatNum)) {
      seatNum++;
    }

    const tktId = `SIM-${Date.now().toString().slice(-6)}-GH`;
    const mockMomoId = `SIM-MOM-${Math.floor(100000 + Math.random() * 900000)}`;
    const fare = currentSchedule.routeId === 'rt-acc-kum' ? 120 : currentSchedule.routeId === 'rt-acc-tam' ? 240 : 100;
    
    // Generate signature payload
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

    // Update schedules
    const updatedSchedules = schedules.map(s => {
      if (s.id === currentSchedule.id) {
        const updatedSeats = [...s.reservedSeats, seatNum];
        // Auto-leak/dispatch check
        let updatedStatus = s.status;
        if (updatedSeats.length >= Math.floor(s.totalSeats * 0.85)) {
          updatedStatus = 'boarding';
        }
        return {
          ...s,
          reservedSeats: updatedSeats,
          status: updatedStatus
        };
      }
      return s;
    });

    setSchedules(updatedSchedules);
    saveSchedules(updatedSchedules);

    // Save bookings
    const updatedBookings = [...bookings, newBooking];
    setBookings(updatedBookings);
    saveBookings(updatedBookings);

    // Add audit log
    addAuditLog(
      'system',
      'simulated_booking',
      `Accumulated simulated booking on Schedule ${currentSchedule.id}. Bucket level is now ${currentSchedule.reservedSeats.length + 1}/${currentSchedule.totalSeats}.`
    );
  };

  const triggerDispatch = () => {
    if (!currentSchedule) return;

    const updatedSchedules = schedules.map(s => {
      if (s.id === currentSchedule.id) {
        return {
          ...s,
          status: 'departed' as const
        };
      }
      return s;
    });

    setSchedules(updatedSchedules);
    saveSchedules(updatedSchedules);

    addAuditLog(
      'operator',
      'bus_dispatch',
      `Operator triggered manual dispatch for Bus ${currentSchedule.busNumber}. Congestion resolved for route.`
    );
  };

  // Financial calculations
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
        
        {/* Fleet Selection List */}
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

        {/* Dispatch Metrics Dashboard */}
        {currentSchedule && leakyBucketData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Leaky Bucket Simulation Visualizer */}
            <section className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>
                Algorithmic Queue Status: Leaky Bucket Metrics
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Arrival Velocity</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    {velocity} pax/hr
                  </p>
                </div>
                
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Est. Departure Time</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {leakyBucketData.estimatedMinutesToDeparture === 0 ? 'Ready to leak' : `In ${leakyBucketData.estimatedMinutesToDeparture} mins`}
                  </p>
                </div>

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

              {/* Accumulation Velocity Simulator */}
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

              {/* Bucket Filling Visual Level */}
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

              {/* Control Buttons */}
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

            {/* Passenger Manifest and Financial Reconciliation */}
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
