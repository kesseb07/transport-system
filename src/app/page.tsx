'use client';

import React, { useState, useEffect } from 'react';
import {
  ROUTES,
  OPERATORS,
  Schedule,
  Booking,
  getSchedules,
  saveSchedules,
  getBookings,
  saveBookings,
  addAuditLog
} from '../services/database';
import { calculateShortestPath, generateOfflineSignature } from '../services/algorithms';

export default function CommuterPortal() {
  const [origin, setOrigin] = useState('Acc');
  const [destination, setDestination] = useState('Kum');
  const [shortestPathResult, setShortestPathResult] = useState<any>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  
  // Passenger Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Telecel' | 'AT'>('MTN');
  
  // States
  const [showCheckout, setShowCheckout] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUSSDModal, setShowUSSDModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [activeTicket, setActiveTicket] = useState<Booking | null>(null);

  useEffect(() => {
    // Load schedules from storage
    setSchedules(getSchedules());
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (origin === destination) {
      alert('Origin and destination cannot be the same.');
      return;
    }
    
    // Calculate Dijkstra path
    const result = calculateShortestPath(origin, destination);
    setShortestPathResult(result);
    setSelectedSchedule(null);
    setSelectedSeat(null);
  };

  const selectSeat = (seat: number) => {
    if (selectedSchedule?.reservedSeats.includes(seat)) return;
    setSelectedSeat(seat);
  };

  const triggerPayment = () => {
    if (!name || !phone) {
      alert('Please enter your name and phone number.');
      return;
    }
    if (selectedSeat === null) {
      alert('Please select a seat.');
      return;
    }
    setShowUSSDModal(true);
  };

  const processPayment = () => {
    if (pinCode.length < 4) {
      alert('Please enter a valid PIN.');
      return;
    }
    
    setShowUSSDModal(false);
    setIsProcessing(true);

    setTimeout(() => {
      if (!selectedSchedule || selectedSeat === null) return;
      
      const ticketId = `TKT-${Date.now().toString().slice(-6)}-GH`;
      const amount = selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100;
      
      // Generate Cryptographic Offline signature
      const signature = generateOfflineSignature(
        ticketId,
        name,
        selectedSeat,
        selectedSchedule.busNumber
      );
      const qrPayload = JSON.stringify({
        ticketId,
        passengerName: name,
        seatNumber: selectedSeat,
        busNumber: selectedSchedule.busNumber,
        signature
      });

      const newBooking: Booking = {
        id: ticketId,
        scheduleId: selectedSchedule.id,
        passengerName: name,
        passengerPhone: phone,
        seatNumber: selectedSeat,
        momoProvider,
        momoTransactionId: `MOM-${Math.floor(100000 + Math.random() * 900000)}`,
        amountPaid: amount,
        timestamp: new Date().toISOString(),
        qrPayload,
        isValidated: false
      };

      // Save to database
      const bookings = getBookings();
      bookings.push(newBooking);
      saveBookings(bookings);

      // Lock seat in schedule
      const updatedSchedules = schedules.map(s => {
        if (s.id === selectedSchedule.id) {
          return {
            ...s,
            reservedSeats: [...s.reservedSeats, selectedSeat]
          };
        }
        return s;
      });
      setSchedules(updatedSchedules);
      saveSchedules(updatedSchedules);

      // Log transaction in Audit
      addAuditLog(
        'passenger',
        'ticket_booking',
        `Passenger ${name} booked Seat ${selectedSeat} on Bus ${selectedSchedule.busNumber}. Amount paid: GHS ${amount} via ${momoProvider}.`
      );

      setActiveTicket(newBooking);
      setIsProcessing(false);
      setShowCheckout(false);
    }, 2000);
  };

  // Filter schedules to match search origin/destination
  const getFilteredSchedules = () => {
    if (!shortestPathResult || shortestPathResult.path.length === 0) return [];
    
    // Map graph nodes to database route IDs
    // Standard Accra-Kumasi, Accra-Tamale, Accra-Takoradi routes
    const routeCode = `${origin.toLowerCase()}-${destination.toLowerCase()}`;
    let matchRouteId = '';
    if (origin === 'Acc' && destination === 'Kum') matchRouteId = 'rt-acc-kum';
    if (origin === 'Acc' && destination === 'Tam') matchRouteId = 'rt-acc-tam';
    if (origin === 'Acc' && destination === 'Tak') matchRouteId = 'rt-acc-tak';
    
    // Fallback search route matching
    return schedules.filter(s => s.routeId === matchRouteId || matchRouteId === '');
  };

  const matchedSchedules = getFilteredSchedules();
  const originNodeName = ROUTES.find(r => r.id.includes(origin.toLowerCase()))?.origin || origin;
  const destNodeName = ROUTES.find(r => r.id.includes(destination.toLowerCase()))?.destination || destination;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
      
      {/* Title Header */}
      <section style={{ textAlign: 'center', padding: '24px 0' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '8px', background: 'linear-gradient(135deg, #f3f4f6 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Avoid The Terminal Queue
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          Select routes, secure your seat, and pay instantly via Mobile Money
        </p>
      </section>

      {/* Query Search Area */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)', gap: '24px', alignItems: 'start' }}>
        
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Find Your Bus Route</h2>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Departing From</label>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="Acc">Accra (Circle)</option>
                <option value="Kum">Kumasi (Kejetia)</option>
                <option value="Tak">Takoradi</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Going To</label>
              <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="Kum">Kumasi (Kejetia)</option>
                <option value="Tam">Tamale</option>
                <option value="Tak">Takoradi</option>
              </select>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              Query Schedules
            </button>
          </form>

          {shortestPathResult && (
            <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--accent-gold)', fontWeight: 600 }}>Dijkstra Route Optimization:</p>
              <p style={{ fontSize: '0.85rem', marginTop: '6px', color: 'var(--text-main)' }}>
                Path: {shortestPathResult.path.join(' -> ')}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Distance: {shortestPathResult.totalDistance} km
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Est. Duration: {Math.floor(shortestPathResult.totalTimeMins / 60)} hrs {shortestPathResult.totalTimeMins % 60} mins
              </p>
            </div>
          )}
        </section>

        {/* Schedules Result List */}
        <section>
          {shortestPathResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Available Buses: {originNodeName} to {destNodeName}</h2>
              {matchedSchedules.length > 0 ? (
                matchedSchedules.map(sch => {
                  const op = OPERATORS.find(o => o.id === sch.operatorId);
                  return (
                    <div 
                      key={sch.id} 
                      className="glass-panel" 
                      style={{ 
                        padding: '20px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        borderColor: selectedSchedule?.id === sch.id ? 'var(--primary)' : 'var(--border-glass)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            background: op?.color, 
                            color: '#fff', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem',
                            fontWeight: 700 
                          }}>
                            {op?.name}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Bus: {sch.busNumber}</span>
                        </div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '8px 0 4px 0' }}>{sch.scheduledTime}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Capacity: {sch.totalSeats - sch.reservedSeats.length} / {sch.totalSeats} seats remaining
                        </p>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setSelectedSchedule(sch);
                          setSelectedSeat(null);
                          setActiveTicket(null);
                        }} 
                        className="btn-secondary"
                      >
                        {selectedSchedule?.id === sch.id ? 'Selected' : 'Reserve Seat'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No operator schedules currently match this specific journey combination.
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '64px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Enter your route coordinates on the left and select search to load operator dispatch queues.
            </div>
          )}
        </section>

      </div>

      {/* Seat Selection Panel */}
      {selectedSchedule && !activeTicket && (
        <section className="glass-panel" style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Select Seat: Bus {selectedSchedule.busNumber}</h2>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '12px', 
              background: 'rgba(0, 0, 0, 0.4)', 
              padding: '24px', 
              borderRadius: '12px',
              maxWidth: '320px',
              margin: '0 auto'
            }}>
              {Array.from({ length: selectedSchedule.totalSeats }, (_, i) => i + 1).map(seat => {
                const isBooked = selectedSchedule.reservedSeats.includes(seat);
                const isSelected = selectedSeat === seat;
                
                return (
                  <button
                    key={seat}
                    disabled={isBooked}
                    onClick={() => selectSeat(seat)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: '6px',
                      border: '1px solid',
                      borderColor: isBooked 
                        ? 'rgba(239, 68, 68, 0.2)' 
                        : isSelected 
                          ? 'var(--primary)' 
                          : 'rgba(255, 255, 255, 0.1)',
                      background: isBooked 
                        ? 'rgba(239, 68, 68, 0.15)' 
                        : isSelected 
                          ? 'var(--primary)' 
                          : 'rgba(255, 255, 255, 0.03)',
                      color: isBooked 
                        ? '#ef4444' 
                        : isSelected 
                          ? '#fff' 
                          : 'var(--text-muted)',
                      fontWeight: 600,
                      cursor: isBooked ? 'not-allowed' : 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                  >
                    {seat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkout Info */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Reservation Summary</h3>
            <p style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-gold)', marginBottom: '16px' }}>
              Fare: GHS {selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100}.00
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <input 
                type="text" 
                placeholder="Full Name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
              />
              <input 
                type="tel" 
                placeholder="Mobile Money Number (e.g. 054...)" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
              />
              <select 
                value={momoProvider} 
                onChange={(e) => setMomoProvider(e.target.value as any)}
              >
                <option value="MTN">MTN Mobile Money</option>
                <option value="Telecel">Telecel Cash</option>
                <option value="AT">ATMoney</option>
              </select>
            </div>

            <button onClick={triggerPayment} className="btn-primary" style={{ width: '100%' }}>
              Proceed to Pay GHS {selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100}.00
            </button>
          </div>
        </section>
      )}

      {/* USSD Prompt Overlay Simulator */}
      {showUSSDModal && selectedSchedule && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{ padding: '32px', width: '90%', maxWidth: '400px', textAlign: 'center', border: '1px solid var(--accent-gold)' }}>
            <span className="badge badge-momo" style={{ marginBottom: '16px' }}>
              {momoProvider} Payment Request
            </span>
            <p style={{ margin: '16px 0', fontSize: '1rem', color: 'var(--text-main)' }}>
              Authorize payment of GHS {selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100}.00 to AccraTransit?
            </p>
            <input 
              type="password" 
              maxLength={4}
              placeholder="Enter 4-Digit Mobile Money PIN" 
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              style={{ textAlign: 'center', letterSpacing: '12px', fontSize: '1.25rem', width: '100%', marginBottom: '24px' }}
            />
            <div style={{ display: 'flex', gap: '16px' }}>
              <button onClick={() => setShowUSSDModal(false)} className="btn-secondary" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={processPayment} className="btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, var(--accent-gold) 0%, #d97706 100%)', boxShadow: '0 4px 14px 0 rgba(251, 191, 36, 0.2)' }}>
                Confirm Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Processing Spinner */}
      {isProcessing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(9, 9, 14, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid rgba(139, 92, 246, 0.1)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '16px'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <p className="pulse" style={{ color: 'var(--text-muted)' }}>Contacting gateway to resolve manifest transaction...</p>
        </div>
      )}

      {/* Cryptographic QR Ticket Display */}
      {activeTicket && selectedSchedule && (
        <section className="glass-panel" style={{ padding: '32px', maxWidth: '500px', margin: '0 auto', textAlign: 'center', border: '1px solid var(--border-glass-active)' }}>
          <span className="badge badge-success" style={{ marginBottom: '16px' }}>
            Reservation Confirmed
          </span>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '20px' }}>Your Digital Ticket</h2>

          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', display: 'inline-block', marginBottom: '24px' }}>
            {/* High contrast scannable region */}
            <div style={{ border: '2px dashed #000', padding: '16px', background: '#fff' }}>
              <div style={{ width: '180px', height: '180px', background: '#000', margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#fff', padding: '12px' }}>
                {/* Mock QR Code Pattern Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%', height: '100%' }}>
                  <div style={{ background: '#fff' }} />
                  <div style={{ background: '#000' }} />
                  <div style={{ background: '#fff' }} />
                  <div style={{ background: '#000' }} />
                  <div style={{ background: '#fff' }} />
                  <div style={{ background: '#000' }} />
                  <div style={{ background: '#fff' }} />
                  <div style={{ background: '#000' }} />
                  <div style={{ background: '#fff' }} />
                </div>
              </div>
              <p style={{ color: '#000', fontSize: '0.65rem', fontFamily: 'monospace', marginTop: '12px', wordBreak: 'break-all' }}>
                SIG: {JSON.parse(activeTicket.qrPayload).signature}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)', marginBottom: '24px' }}>
            <p style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--text-muted)' }}>Ticket ID:</span> {activeTicket.id}</p>
            <p style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--text-muted)' }}>Passenger:</span> {activeTicket.passengerName}</p>
            <p style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--text-muted)' }}>Phone:</span> {activeTicket.passengerPhone}</p>
            <p style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--text-muted)' }}>Bus number:</span> {selectedSchedule.busNumber}</p>
            <p style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--text-muted)' }}>Seat allocated:</span> {activeTicket.seatNumber}</p>
            <p style={{ fontSize: '0.9rem' }}><span style={{ color: 'var(--text-muted)' }}>Departing:</span> {selectedSchedule.scheduledTime}</p>
          </div>

          <button onClick={() => setActiveTicket(null)} className="btn-secondary" style={{ width: '100%' }}>
            Book Another Journey
          </button>
        </section>
      )}

    </div>
  );
}
