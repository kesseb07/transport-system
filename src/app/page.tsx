/**
 * ============================================================================
 * page.tsx — COMMUTER PORTAL (application home page, route: /)
 * ============================================================================
 *
 * The passenger-facing interface and the primary demonstration of the system.
 * It implements the complete digital ticketing lifecycle that this project
 * proposes as a replacement for physical queuing at terminal counters:
 *
 *   1. SEARCH   — passenger chooses origin and destination; Dijkstra's
 *                 algorithm computes the optimal route, distance and duration.
 *   2. SELECT   — matching buses are listed; passenger picks one.
 *   3. RESERVE  — an interactive seat map shows which seats remain.
 *   4. PAY      — a simulated Mobile Money authorisation flow.
 *   5. ISSUE    — each seat receives a cryptographically signed ticket, and
 *                 the passenger is redirected to their boarding passes.
 *
 * The 'use client' directive below marks this as a React Client Component.
 * Next.js renders components on the server by default, but this page needs
 * browser-only features (state hooks, click handlers, localStorage), so it
 * must execute in the browser.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  ROUTES,
  OPERATORS,
  Schedule,
  Booking,
  getSchedules,
  saveSchedule,
  addBooking,
  addAuditLog
} from '../services/database';
import { calculateShortestPath, generateOfflineSignature } from '../services/algorithms';
import { useRouter } from 'next/navigation';

export default function CommuterPortal() {
  // Next.js navigation controller, used to redirect to the ticket page after
  // a successful booking.
  const router = useRouter();

  // --- SEARCH CRITERIA ----------------------------------------------------
  // City codes matching the node IDs in the transit graph, so they can be
  // passed straight into the shortest-path solver.
  const [origin, setOrigin] = useState('Acc');       // default: Accra
  const [destination, setDestination] = useState('Kum'); // default: Kumasi
  const [operatorFilter, setOperatorFilter] = useState('All');

  // Today's date in YYYY-MM-DD form, used as the minimum selectable travel
  // date so past dates cannot be chosen.
  const todayStr = new Date().toISOString().split('T')[0];
  // NOTE: the travel date is captured and validated but does not yet filter
  // results — the seeded timetable models a single representative day rather
  // than a multi-date calendar. Extending the schedule table with a date
  // column would be the natural next step.
  const [bookingDate, setBookingDate] = useState(() => todayStr);

  // --- SEARCH RESULTS AND SELECTION --------------------------------------
  /**
   * Output of Dijkstra's algorithm: { path, totalDistance, totalTimeMins }.
   * Also acts as a flag for whether a search has been run — the results panel
   * stays in its empty state while this is null.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [shortestPathResult, setShortestPathResult] = useState<any>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);          // full timetable from the database
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null); // bus the passenger chose
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);    // seats picked on the seat map

  // --- PASSENGER AND PAYMENT DETAILS --------------------------------------
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Ghana's three mobile money networks. Mobile money is the dominant payment
  // method for this market, which is why no card payment option is offered.
  const [momoProvider, setMomoProvider] = useState<'MTN' | 'Telecel' | 'AT'>('MTN');

  // --- INTERFACE STATE ----------------------------------------------------
  const [isProcessing, setIsProcessing] = useState(false);   // full-screen spinner during ticket issue
  const [showUSSDModal, setShowUSSDModal] = useState(false); // simulated payment authorisation prompt
  const [pinCode, setPinCode] = useState('');                // reserved for a future PIN entry step; currently unused

  // Ethics disclosure shown on arrival, declaring that this is an academic
  // prototype and that no real payments are processed.
  const [showAbout, setShowAbout] = useState(true);

  const closeAbout = () => {
    setShowAbout(false);
  };

  /** Fetches the current timetable, including seats reserved by other users. */
  const loadData = async () => {
    const data = await getSchedules();
    setSchedules(data);
  };

  // Load the timetable once when the page first mounts. The empty dependency
  // array [] means "run on mount only", never on subsequent re-renders.
  useEffect(() => {
    // eslint-disable-next-line
    loadData();
  }, []);

  /**
   * STEP 1 — SEARCH. Runs Dijkstra's algorithm for the chosen city pair.
   *
   * Note that the route calculation is purely local: no network request is
   * needed to tell the passenger how far the journey is and how long it takes.
   */
  const handleSearch = (e: React.FormEvent) => {
    // Prevent the browser's default form submission, which would reload the page.
    e.preventDefault();

    if (origin === destination) {
      alert('Origin and destination cannot be the same.');
      return;
    }

    // Invoke the shortest-path solver (see services/algorithms.ts).
    const result = calculateShortestPath(origin, destination);
    setShortestPathResult(result);

    // Clear any prior selection so results from a previous search cannot be
    // carried over into the new journey.
    setSelectedSchedule(null);
    setSelectedSeats([]);
  };

  /**
   * STEP 3 — SEAT SELECTION. Toggles a seat on or off the passenger's selection.
   *
   * Supports multi-seat booking (a family travelling together), so each seat
   * is added to or removed from a list rather than replacing a single choice.
   */
  const selectSeat = (seat: number) => {
    // Guard: already-reserved seats cannot be selected. The button is also
    // disabled in the markup, but this check protects the state directly.
    if (selectedSchedule?.reservedSeats.includes(seat)) return;

    // Toggle: remove if already chosen, otherwise append.
    setSelectedSeats(prev => prev.includes(seat) ? prev.filter(s => s !== seat) : [...prev, seat]);
  };

  /**
   * STEP 4a — Validates the form, then opens the simulated Mobile Money prompt.
   *
   * This mirrors the real user experience in Ghana: the passenger confirms on
   * the website, then receives a USSD authorisation prompt on their handset.
   */
  const triggerPayment = () => {
    if (!name || !phone) {
      alert('Please enter your name and phone number.');
      return;
    }
    if (selectedSeats.length === 0) {
      alert('Please select at least one seat.');
      return;
    }
    setShowUSSDModal(true);
  };

  /**
   * STEP 4b/5 — Completes the purchase once the passenger confirms payment.
   *
   * This is the most consequential function on the page. It issues one signed
   * ticket per selected seat, updates the bus's reserved-seat list, writes an
   * audit record, and redirects to the boarding passes.
   *
   * SIMULATION BOUNDARY: no real money moves. A production build would call a
   * Mobile Money gateway API here and wait for a webhook confirming settlement
   * before issuing any ticket. The transaction ID generated below stands in for
   * the reference such a gateway would return.
   */
  const processPayment = async () => {
    // Swap the payment prompt for the processing spinner.
    setShowUSSDModal(false);
    setIsProcessing(true);

    // Defensive guard against an inconsistent state.
    // KNOWN ISSUE: this returns without clearing isProcessing, so the spinner
    // would remain on screen. Unreachable in normal use, because
    // triggerPayment() already enforces both conditions before this modal can
    // open, but it should reset the flag before returning.
    if (!selectedSchedule || selectedSeats.length === 0) return;

    // Look up the authoritative fare for this route from the reference data.
    const routeDetails = ROUTES.find(r => r.id === selectedSchedule.routeId);
    const amountPerSeat = routeDetails ? routeDetails.baseFareGhs : 100;
    const totalAmount = amountPerSeat * selectedSeats.length;

    const generatedTickets: Booking[] = [];
    // Copy the existing reservations rather than mutating state directly —
    // React state must be treated as immutable.
    const newReservedSeats = [...selectedSchedule.reservedSeats];

    // Issue one independent ticket per seat. Each is separately signed and
    // separately scannable, so travelling companions can board individually.
    for (const seat of selectedSeats) {
      // Ticket ID combines a timestamp fragment with the seat number, keeping
      // it unique within the booking while remaining short enough to print.
      const ticketId = `TKT-${Date.now().toString().slice(-6)}-${seat}`;

      // Generate the tamper-detection signature (see services/algorithms.ts).
      // This is what lets gate staff verify the ticket with no network access.
      const signature = generateOfflineSignature(
        ticketId,
        name,
        seat,
        selectedSchedule.busNumber
      );

      // The complete QR payload: all ticket details plus the signature, so the
      // ticket is self-contained and self-verifying.
      const qrPayload = JSON.stringify({
        ticketId,
        passengerName: name,
        seatNumber: seat,
        busNumber: selectedSchedule.busNumber,
        signature
      });

      const newBooking: Booking = {
        id: ticketId,
        scheduleId: selectedSchedule.id,
        passengerName: name,
        passengerPhone: phone,
        seatNumber: seat,
        momoProvider,
        // Stands in for the reference a real Mobile Money gateway would return.
        momoTransactionId: `MOM-${Math.floor(100000 + Math.random() * 900000)}`,
        amountPaid: amountPerSeat,
        timestamp: new Date().toISOString(),
        qrPayload,
        isValidated: false // becomes true when scanned at the boarding gate
      };

      await addBooking(newBooking);
      newReservedSeats.push(seat);
      generatedTickets.push(newBooking);
    }

    // Update the bus so these seats appear taken to every other passenger.
    // This also raises the leaky bucket's fill level, moving the bus closer to
    // its dispatch threshold.
    const updatedSchedule: Schedule = {
      ...selectedSchedule,
      reservedSeats: newReservedSeats
    };

    await saveSchedule(updatedSchedule);

    // Record the sale in the tamper-evident ledger. This is the regulator's
    // independent evidence of revenue collected, addressing the revenue-leakage
    // problem that motivates the study.
    await addAuditLog(
      'passenger',
      'ticket_booking',
      `Passenger ${name} booked Seats [${selectedSeats.join(', ')}] on Bus ${selectedSchedule.busNumber}. Amount paid: GHS ${totalAmount} via ${momoProvider}.`
    );

    // Refresh the timetable so the seat map reflects the new reservations.
    await loadData();
    setIsProcessing(false);

    // Redirect to the boarding passes, passing ticket IDs in the query string
    // so that page can retrieve and render them.
    const ticketIds = generatedTickets.map(t => t.id).join(',');
    router.push(`/booked?tickets=${ticketIds}`);
  };

  /**
   * STEP 2 — Selects the buses that serve the searched journey.
   *
   * Route IDs follow the convention 'rt-<origin>-<destination>', so the ID to
   * match can be reconstructed directly from the selected city codes rather
   * than searched for.
   *
   * Both directions are matched because a road is bidirectional: the stored
   * route 'rt-acc-kum' also serves passengers travelling Kumasi to Accra, and
   * only one direction is stored to avoid duplicating the reference data.
   *
   * LIMITATION: this matches only DIRECT services. Where Dijkstra returns a
   * multi-hop path (Accra -> Cape Coast -> Takoradi), no single stored route
   * matches, so the route summary is displayed but no bookable bus is listed.
   * Supporting connecting journeys would require booking each leg separately.
   */
  const getFilteredSchedules = () => {
    // Nothing to show until a search has produced a valid route.
    if (!shortestPathResult || shortestPathResult.path.length === 0) return [];

    // Route IDs are stored lowercase, e.g. 'rt-acc-kum'.
    const originLower = origin.toLowerCase();
    const destLower = destination.toLowerCase();
    const matchRouteIdForward = `rt-${originLower}-${destLower}`;
    const matchRouteIdReverse = `rt-${destLower}-${originLower}`;

    let filtered = schedules.filter(s =>
      s.routeId === matchRouteIdForward ||
      s.routeId === matchRouteIdReverse
    );

    // Apply the optional operator filter (VIP Jeoun / Intercity STC / All).
    if (operatorFilter !== 'All') {
      filtered = filtered.filter(s => s.operatorId === operatorFilter);
    }

    return filtered;
  };

  // Recomputed on every render so the list always reflects current state.
  const matchedSchedules = getFilteredSchedules();

  // Resolve city codes to display names for the results heading, falling back
  // to the raw code if no route mentions the city.
  const originNodeName = ROUTES.find(r => r.id.includes(origin.toLowerCase()))?.origin || origin;
  const destNodeName = ROUTES.find(r => r.id.includes(destination.toLowerCase()))?.destination || destination;

  // =========================================================================
  // RENDER — the visible interface
  // =========================================================================
  // Sections appear progressively as the passenger advances: the seat map only
  // renders once a bus is selected, and the payment prompt only once seats are
  // chosen. This is expressed with React's conditional rendering pattern
  // `{condition && <element/>}`, which renders the element only when the
  // condition holds.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>

      {/* ---- PAGE HEADING ---- */}
      <section style={{ textAlign: 'center', padding: '24px 0' }}>
        <h1 className="header-title" style={{ fontWeight: 800, marginBottom: '8px', background: 'linear-gradient(135deg, #f3f4f6 0%, var(--text-muted) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Avoid The Terminal Queue
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          Select routes, secure your seat, and pay instantly via Mobile Money
        </p>
      </section>

      {/* Two-column layout: search form on the left, results on the right.
          Collapses to a single column on mobile via the .main-grid media
          query in globals.css. */}
      <div className="main-grid">

        {/* ================= SEARCH PANEL (STEP 1) ================= */}
        <section className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Find Your Bus Route</h2>
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="origin-select" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Departing From</label>
              <select id="origin-select" title="Select Origin" aria-label="Departing From" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="Acc">Accra (Circle)</option>
                <option value="Kum">Kumasi (Kejetia)</option>
                <option value="Tak">Takoradi</option>
                <option value="Tam">Tamale</option>
                <option value="Sun">Sunyani</option>
                <option value="Ho">Ho</option>
                <option value="Cap">Cape Coast</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="destination-select" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Going To</label>
              <select id="destination-select" title="Select Destination" aria-label="Going To" value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="Kum">Kumasi (Kejetia)</option>
                <option value="Tam">Tamale</option>
                <option value="Tak">Takoradi</option>
                <option value="Acc">Accra (Circle)</option>
                <option value="Sun">Sunyani</option>
                <option value="Ho">Ho</option>
                <option value="Cap">Cape Coast</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="travel-date" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date of Travel</label>
              <input 
                id="travel-date"
                title="Select Travel Date"
                aria-label="Date of Travel"
                type="date" 
                min={todayStr}
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="operator-select" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Operator Type</label>
              <select id="operator-select" title="Select Operator" aria-label="Operator Type" value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)}>
                <option value="All">All Operators</option>
                {OPERATORS.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              Query Schedules
            </button>
          </form>

          {/* Dijkstra output panel. Surfacing the algorithm's result directly
              in the interface is deliberate: it makes the route computation
              observable rather than hidden, which matters for demonstrating
              the algorithm during assessment. */}
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

        {/* ================= RESULTS PANEL (STEP 2) =================
            Three display states: the pre-search prompt, the list of matching
            buses, or a "no direct service" message. */}
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
                        {/* Live availability, derived by subtracting reserved
                            seats from capacity. */}
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Capacity: {sch.totalSeats - sch.reservedSeats.length} / {sch.totalSeats} seats remaining
                        </p>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setSelectedSchedule(sch);
                          setSelectedSeats([]);
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

      {/* ================= SEAT MAP & RESERVATION (STEP 3) =================
          Appears only once a bus has been selected. The seat map replaces the
          physical seating chart a counter clerk would consult, and is the
          feature that removes the need to queue in person. */}
      {selectedSchedule && (
        <section className="glass-panel reservation-grid" style={{ padding: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px' }}>Select Seat: Bus {selectedSchedule.busNumber}</h2>
            <div className="seat-grid seat-map-container" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '12px', 
              padding: '24px', 
              borderRadius: '12px',
              maxWidth: '320px',
              margin: '0 auto'
            }}>
              {/* Build seat numbers 1..totalSeats and render a button for each.
                  Array.from() with a length and a mapping function is the
                  idiomatic way to produce a numbered sequence in JavaScript.
                  Seat count varies by operator (49 for VIP, 44 for STC), so the
                  grid adapts to whichever bus was chosen. */}
              {Array.from({ length: selectedSchedule.totalSeats }, (_, i) => i + 1).map(seat => {
                // Each seat is in exactly one of three visual states:
                // already booked by someone else, chosen by this passenger, or
                // free. The CSS classes below correspond to these states.
                const isBooked = selectedSchedule.reservedSeats.includes(seat);
                const isSelected = selectedSeats.includes(seat);

                return (
                  <button
                    key={seat}
                    disabled={isBooked}
                    onClick={() => selectSeat(seat)}
                    className={
                      isBooked 
                        ? 'seat-btn-booked' 
                        : isSelected 
                          ? 'seat-btn-selected' 
                          : 'seat-btn-available'
                    }
                    style={{
                      aspectRatio: '1',
                      borderRadius: '6px',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      fontSize: '1rem',
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

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>Reservation Summary</h3>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
               <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '6px' }}>
                 <strong style={{ color: 'var(--text-muted)' }}>Operator:</strong> {OPERATORS.find(o => o.id === selectedSchedule.operatorId)?.name}
               </p>
               <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                 <strong style={{ color: 'var(--text-muted)' }}>Seats Booked:</strong> {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None'}
               </p>
            </div>

            {/* Fare display.
                KNOWN INCONSISTENCY: the fare shown here is computed from a
                hard-coded conditional covering only the Accra-Kumasi and
                Accra-Tamale routes, defaulting every other route to GHS 100.
                The amount actually charged and recorded in processPayment()
                comes from the authoritative ROUTES table instead. The two
                therefore disagree on the remaining routes — Accra to Ho, for
                example, displays 100 but is billed at its true fare of 80.
                The correct fix is to look the fare up from ROUTES here as
                well; the hard-coded values are a development shortcut that was
                not removed. The same expression is repeated in the pay button
                and the payment prompt below. */}
            <p style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-gold)', marginBottom: '16px' }}>
              Fare: GHS {(selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100) * Math.max(1, selectedSeats.length)}.00
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
                id="momo-provider"
                title="Select Mobile Money Provider"
                aria-label="Select Mobile Money Provider"
                value={momoProvider} 
                onChange={(e) => setMomoProvider(e.target.value as 'MTN' | 'Telecel' | 'AT')}
              >
                <option value="MTN">MTN Mobile Money</option>
                <option value="Telecel">Telecel Cash</option>
                <option value="AT">ATMoney</option>
              </select>
            </div>

            <button onClick={triggerPayment} className="btn-primary" style={{ width: '100%' }}>
              Proceed to Pay GHS {(selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100) * Math.max(1, selectedSeats.length)}.00
            </button>
          </div>
        </section>
      )}

      {/* ================= MOBILE MONEY PROMPT (STEP 4) =================
          Simulates the USSD authorisation flow familiar to Ghanaian mobile
          money users: the passenger confirms on the site, then approves the
          debit on their handset. The "I have completed the payment" button
          stands in for the gateway webhook that would confirm settlement in a
          production system. No real payment is processed. */}
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
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                border: '4px solid rgba(139, 92, 246, 0.1)',
                borderTopColor: 'var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px auto'
              }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>Waiting for Authorization</h3>
              <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
                A payment prompt has been sent to <strong>{phone}</strong> via {momoProvider}. Please check your phone and authorize the payment of <strong>GHS {(selectedSchedule.routeId === 'rt-acc-kum' ? 120 : selectedSchedule.routeId === 'rt-acc-tam' ? 240 : 100) * Math.max(1, selectedSeats.length)}.00</strong> to GhanaTBS.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={processPayment} className="btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.2)' }}>
                I have completed the payment
              </button>
              <button onClick={() => setShowUSSDModal(false)} className="btn-secondary" style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
                Cancel Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= PROCESSING OVERLAY (STEP 5) =================
          Blocks interaction while tickets are signed and written to the
          database, preventing a double submission from issuing duplicates. */}
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


      {/* ================= ETHICS DISCLOSURE =================
          Shown on first load. Declares that this is an academic research
          prototype rather than a commercial service and that no real payments
          are taken — a research-ethics requirement, since the interface
          otherwise closely resembles a genuine booking site. */}
      {showAbout && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(9, 9, 14, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
          padding: '24px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '500px', padding: '32px', textAlign: 'center', background: 'var(--bg-card)' }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '16px' }}>Academic Research Prototype</h2>
            <p style={{ color: 'var(--text-main)', marginBottom: '16px', lineHeight: 1.6 }}>
              Hello, my name is Kesse. Welcome to <strong>GhanaTBS</strong>. 
            </p>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6, fontSize: '0.95rem' }}>
              Please note that this application is a <strong> Transport Booking System</strong> built as a <strong>research prototype</strong> for an academic dissertation. It explores solutions to intercity transport terminal congestion in Ghana. It is not a commercial product or a startup pitch. No real payments are processed.
            </p>
            <button onClick={closeAbout} className="btn-primary" style={{ width: '100%' }}>
              I Understand
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
