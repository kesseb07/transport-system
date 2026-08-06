/**
 * ============================================================================
 * database.ts — DATA ACCESS LAYER
 * ============================================================================
 *
 * Single point of contact between the user interface and stored data. Every
 * page in the application reads and writes through the functions here rather
 * than talking to a database directly. This separation means the storage
 * mechanism can change without touching any page component.
 *
 * DUAL-BACKEND (GRACEFUL DEGRADATION) DESIGN
 * ------------------------------------------
 * Every read and write function follows the same two-tier pattern:
 *
 *   TIER 1 — Supabase (cloud PostgreSQL). Used when credentials are configured
 *            in .env.local. Provides shared, persistent, multi-user state, so
 *            a seat booked in one browser is immediately unavailable in
 *            another. This is the intended demonstration mode.
 *
 *   TIER 2 — browser localStorage. Used automatically whenever Supabase is
 *            unconfigured or a query fails. State persists per-browser only.
 *
 * The fallback exists for a practical academic reason: the prototype must
 * remain demonstrable during assessment even with no internet connection or
 * expired database credentials. It also mirrors the offline-tolerance theme
 * running through the whole project.
 *
 * NAMING CONVENTION: this file translates between two styles. TypeScript uses
 * camelCase (`busNumber`); PostgreSQL columns use snake_case (`bus_number`).
 * The mapping is performed explicitly in each function so the boundary between
 * application and database is visible rather than magical.
 */

import { supabase } from './supabaseClient';

// ===========================================================================
// DOMAIN MODEL — the core entities of the transport system
// ===========================================================================

/** A bus company operating on the network (e.g. VIP Jeoun, Intercity STC). */
export interface Operator {
  id: string;
  name: string;
  code: string;  // short prefix used when generating bus registration numbers
  color: string; // brand colour, used to distinguish operators visually in the UI
}

/** A fixed origin-destination pair with its commercial fare. */
export interface Route {
  id: string;          // convention: 'rt-<origin>-<destination>', e.g. 'rt-acc-kum'
  origin: string;
  destination: string;
  distanceKm: number;
  baseFareGhs: number; // fare per seat in Ghana Cedis
}

/** A specific bus running a specific route at a specific time. */
export interface Schedule {
  id: string;
  operatorId: string;
  routeId: string;
  busNumber: string;
  totalSeats: number;
  /**
   * Seat numbers already taken. Doubles as the "bucket level" input to the
   * leaky bucket dispatch algorithm — its length is the current fill level.
   */
  reservedSeats: number[];
  scheduledTime: string;          // nominal advertised departure, e.g. '08:00'
  estimatedDepartureTime: string; // revised estimate produced by the dispatch model
  departureRatePerHour: number;   // expected booking velocity, feeds the leaky bucket
  status: 'scheduled' | 'boarding' | 'departed' | 'delayed';
}

/** One seat reserved by one passenger — the system's central transaction record. */
export interface Booking {
  id: string;         // also serves as the ticket ID printed on the boarding pass
  scheduleId: string; // links this booking to its bus
  passengerName: string;
  passengerPhone: string;
  seatNumber: number;
  momoProvider: 'MTN' | 'Telecel' | 'AT'; // Ghana's three mobile money networks
  momoTransactionId: string;              // simulated payment reference
  amountPaid: number;
  timestamp: string;
  /** JSON string encoded into the QR code, including the offline signature. */
  qrPayload: string;
  isValidated: boolean;  // true once scanned at the boarding gate
  validatedAt?: string;  // time of that scan; undefined until the passenger boards
}

/**
 * An immutable record of one significant system event.
 *
 * Audit logs address the revenue-leakage problem: because operators
 * self-report earnings, a regulator has no independent record of what was
 * actually sold. Every booking, dispatch and gate scan writes an entry here,
 * and the entries are chained by hash (see addAuditLog) so that retrospective
 * alteration is detectable.
 */
export interface AuditLog {
  id: string;
  timestamp: string;
  /** Which party in the system caused the event. */
  actor: 'passenger' | 'operator' | 'regulator' | 'system';
  action: string;  // machine-readable event type, e.g. 'ticket_booking'
  details: string; // human-readable description shown in the regulator ledger
  hash: string;    // chain link binding this entry to the previous one
}

// ===========================================================================
// REFERENCE DATA — the fixed "seed" configuration of the network
// ===========================================================================
// Operators and routes are hard-coded rather than stored in the database.
// They are reference data that does not change during a demonstration, and
// keeping them in source form makes the modelled network immediately visible
// to a reader without requiring database access.

/** The two intercity operators modelled by this study. */
export const OPERATORS: Operator[] = [
  { id: 'op-vip', name: 'VIP Jeoun', code: 'VIP', color: '#ef4444' },
  { id: 'op-stc', name: 'Intercity STC', code: 'STC', color: '#1d4ed8' }
];

/**
 * Commercially operated routes with their fares.
 *
 * These correspond to the edges of the transit graph in algorithms.ts, but
 * serve a different purpose: the graph exists to COMPUTE optimal paths, while
 * this list defines which journeys can actually be BOOKED and at what price.
 */
export const ROUTES: Route[] = [
  { id: 'rt-acc-kum', origin: 'Accra', destination: 'Kumasi', distanceKm: 270, baseFareGhs: 120 },
  { id: 'rt-acc-tam', origin: 'Accra', destination: 'Tamale', distanceKm: 620, baseFareGhs: 240 },
  { id: 'rt-acc-tak', origin: 'Accra', destination: 'Takoradi', distanceKm: 220, baseFareGhs: 100 },
  { id: 'rt-acc-ho', origin: 'Accra', destination: 'Ho', distanceKm: 160, baseFareGhs: 80 },
  { id: 'rt-acc-cap', origin: 'Accra', destination: 'Cape Coast', distanceKm: 145, baseFareGhs: 70 },
  { id: 'rt-kum-tam', origin: 'Kumasi', destination: 'Tamale', distanceKm: 380, baseFareGhs: 150 },
  { id: 'rt-kum-sun', origin: 'Kumasi', destination: 'Sunyani', distanceKm: 120, baseFareGhs: 60 },
  { id: 'rt-sun-tam', origin: 'Sunyani', destination: 'Tamale', distanceKm: 310, baseFareGhs: 130 },
  { id: 'rt-cap-tak', origin: 'Cape Coast', destination: 'Takoradi', distanceKm: 75, baseFareGhs: 40 }
];

/**
 * Guard for server-side rendering. Next.js executes component code on the
 * server during the initial render, where `window` and therefore
 * `localStorage` do not exist. Every localStorage access in this file is
 * gated on this flag to prevent a server-side crash.
 */
const isBrowser = typeof window !== 'undefined';

/**
 * Generates the full timetable from the reference data above.
 *
 * Produces the cartesian product of routes x operators x departure times:
 *   9 routes x 2 operators x 6 daily departures = 108 scheduled buses.
 *
 * This gives the prototype a realistically populated timetable without
 * requiring a manually authored dataset, and is used both to seed an empty
 * Supabase database and to populate localStorage in offline mode.
 */
const seedLocalSchedules = (): Schedule[] => {
  const list: Schedule[] = [];
  // Departures every two hours across the operating day.
  const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
  ROUTES.forEach(route => {
    OPERATORS.forEach(op => {
      hours.forEach((time, index) => {
        list.push({
          // Composite ID encoding operator, route and slot. Deterministic by
          // design, so re-running the seed produces identical IDs rather than
          // duplicating the timetable.
          id: `sch-${op.code.toLowerCase()}-${route.id}-${index}`,
          operatorId: op.id,
          routeId: route.id,
          // Plausible Ghanaian registration format, e.g. 'VIP-843-26'.
          busNumber: `${op.code}-${Math.floor(100 + Math.random() * 900)}-26`,
          // Fleet capacities differ by operator, matching their real coach types.
          totalSeats: op.code === 'VIP' ? 49 : 44,
          reservedSeats: [], // every bus starts empty; bookings fill it during the demo
          scheduledTime: time,
          estimatedDepartureTime: time, // initially equal; revised by the dispatch model
          // Baseline booking velocity fed to the leaky bucket algorithm. VIP is
          // modelled as the busier operator and so fills faster.
          departureRatePerHour: op.code === 'VIP' ? 20 : 15,
          status: 'scheduled'
        });
      });
    });
  });
  return list;
};

// ===========================================================================
// SCHEDULE ACCESS
// ===========================================================================

/**
 * Retrieves the complete timetable, seeding it first if necessary.
 *
 * Resolution order:
 *   1. Supabase, if configured and populated — return the stored timetable.
 *   2. Supabase, if configured but empty — generate the timetable, save it for
 *      future sessions, and return it.
 *   3. localStorage, if previously cached — return the cached timetable.
 *   4. Otherwise — generate a fresh timetable and cache it.
 *
 * The self-seeding behaviour means the prototype works from a completely empty
 * database with no manual setup step, which matters for reproducibility: an
 * examiner can point the app at a blank Supabase project and it will populate
 * itself on first load.
 */
export const getSchedules = async (): Promise<Schedule[]> => {
  if (supabase) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .order('scheduled_time', { ascending: true });

    if (!error && data && data.length > 0) {
      // MIGRATION GUARD: the route network grew during development (Cape Coast
      // and Ho were added later). A stored timetable with fewer than 100
      // entries predates that expansion, so it is discarded and regenerated
      // rather than left inconsistent with the current ROUTES definition.
      if (data.length < 100) {
        // .neq('id', '0') matches every row — Supabase requires a filter on
        // delete as a safeguard against accidental unfiltered deletion.
        await supabase.from('schedules').delete().neq('id', '0');
        data.length = 0; // emptying the array falls through to the seeding branch below
      } else {
        // Translate snake_case database columns into camelCase domain objects.
        return data.map(item => ({
        id: item.id,
        operatorId: item.operator_id || '',
        routeId: item.route_id || '',
        busNumber: item.bus_number,
        totalSeats: item.total_seats,
        reservedSeats: item.reserved_seats || [],
        scheduledTime: item.scheduled_time,
        estimatedDepartureTime: item.estimated_departure_time,
        departureRatePerHour: item.departure_rate_per_hour,
        status: (item.status as any) || 'scheduled'
      }));
      }
    }

    if (!error && data && data.length === 0) {
      // Table is empty (either genuinely new, or just cleared by the migration
      // guard above). Generate the timetable and persist it so subsequent
      // sessions and other users share the same data.
      const seeds = seedLocalSchedules();
      const insertData = seeds.map(s => ({
        id: s.id,
        operator_id: s.operatorId,
        route_id: s.routeId,
        bus_number: s.busNumber,
        total_seats: s.totalSeats,
        reserved_seats: s.reservedSeats,
        scheduled_time: s.scheduledTime,
        estimated_departure_time: s.estimatedDepartureTime,
        departure_rate_per_hour: s.departureRatePerHour,
        status: s.status
      }));
      await supabase.from('schedules').insert(insertData);
      return seeds;
    }
  }

  // --- FALLBACK TIER: localStorage ---------------------------------------
  // Reached when Supabase is unconfigured, unreachable, or returned an error.

  // Server-side render: no localStorage available, so return a transient
  // timetable purely so the initial HTML can be generated.
  if (!isBrowser) return seedLocalSchedules();

  // The '_v2' suffix invalidates caches written before the route network was
  // expanded, serving the same purpose as the migration guard above.
  const cached = localStorage.getItem('bus_schedules_v2');
  if (cached) return JSON.parse(cached);

  // First visit in this browser: generate and cache the timetable.
  const initial = seedLocalSchedules();
  localStorage.setItem('bus_schedules_v2', JSON.stringify(initial));
  return initial;
};

/**
 * Persists changes to a single bus.
 *
 * Only the three mutable fields are written — reserved seats, status and the
 * revised departure estimate. Identity fields such as bus number and route are
 * fixed once seeded, so a partial update avoids overwriting them accidentally.
 *
 * Called whenever a seat is booked (commuter portal) or a bus is dispatched
 * (operator dashboard).
 */
export const saveSchedule = async (schedule: Schedule): Promise<void> => {
  if (supabase) {
    const { error } = await supabase
      .from('schedules')
      .update({
        reserved_seats: schedule.reservedSeats,
        status: schedule.status,
        estimated_departure_time: schedule.estimatedDepartureTime
      })
      .eq('id', schedule.id);
    // Early return on success. If the write failed, execution deliberately
    // continues to the localStorage fallback so the user's action is not lost.
    if (!error) return;
  }

  if (isBrowser) {
    const cached = localStorage.getItem('bus_schedules_v2');
    if (cached) {
      // Read-modify-write: localStorage holds the timetable as a single JSON
      // blob, so the whole list must be rewritten to update one entry.
      const list: Schedule[] = JSON.parse(cached);
      const updated = list.map(s => s.id === schedule.id ? schedule : s);
      localStorage.setItem('bus_schedules_v2', JSON.stringify(updated));
    }
  }
};

// ===========================================================================
// BOOKING ACCESS
// ===========================================================================

/**
 * Retrieves every booking in the system.
 *
 * Consumed by three different pages, each filtering for its own purpose: the
 * operator dashboard builds a passenger manifest, the gate scanner checks for
 * duplicate scans, and the regulator page aggregates revenue totals.
 */
export const getBookings = async (): Promise<Booking[]> => {
  if (supabase) {
    const { data, error } = await supabase.from('bookings').select('*');
    if (!error && data) {
      return data.map(item => ({
        id: item.id,
        scheduleId: item.schedule_id || '',
        passengerName: item.passenger_name,
        passengerPhone: item.passenger_phone,
        seatNumber: item.seat_number,
        momoProvider: (item.momo_provider as any) || 'MTN',
        momoTransactionId: item.momo_transaction_id,
        // PostgreSQL returns numeric/decimal columns as strings to preserve
        // precision, so an explicit conversion is required before arithmetic.
        amountPaid: Number(item.amount_paid),
        timestamp: item.timestamp || new Date().toISOString(),
        qrPayload: item.qr_payload,
        isValidated: !!item.is_validated,          // coerce nullable boolean to strict true/false
        validatedAt: item.validated_at || undefined // normalise SQL NULL to undefined
      }));
    }
  }

  // Fallback tier. Returns empty during server-side rendering, so pages must
  // tolerate an initially empty list and re-fetch once mounted in the browser.
  if (!isBrowser) return [];
  const cached = localStorage.getItem('bus_bookings');
  return cached ? JSON.parse(cached) : [];
};

/**
 * Records a newly purchased ticket.
 *
 * Called once per seat: booking three seats creates three separate Booking
 * records, since each seat is individually assigned, individually scannable at
 * the gate, and individually auditable.
 */
export const addBooking = async (booking: Booking): Promise<void> => {
  if (supabase) {
    const { error } = await supabase.from('bookings').insert({
      id: booking.id,
      schedule_id: booking.scheduleId,
      passenger_name: booking.passengerName,
      passenger_phone: booking.passengerPhone,
      seat_number: booking.seatNumber,
      momo_provider: booking.momoProvider,
      momo_transaction_id: booking.momoTransactionId,
      amount_paid: booking.amountPaid,
      qr_payload: booking.qrPayload,
      is_validated: booking.isValidated,
      validated_at: booking.validatedAt || null
    });
    if (!error) return;
  }

  if (isBrowser) {
    const cached = localStorage.getItem('bus_bookings');
    const list: Booking[] = cached ? JSON.parse(cached) : [];
    list.push(booking);
    localStorage.setItem('bus_bookings', JSON.stringify(list));
  }
};

/**
 * Marks a ticket as used after it has been scanned at the boarding gate.
 *
 * This is the state change that makes duplicate-scan detection possible: the
 * cryptographic signature proves a ticket is genuine, but only this flag
 * records that it has already been redeemed.
 *
 * @param validatedAt Human-readable check-in time, recorded by the gate device.
 */
export const validateBooking = async (bookingId: string, validatedAt: string): Promise<void> => {
  if (supabase) {
    const { error } = await supabase
      .from('bookings')
      .update({
        is_validated: true,
        validated_at: validatedAt
      })
      .eq('id', bookingId);
    if (!error) return;
  }

  if (isBrowser) {
    const cached = localStorage.getItem('bus_bookings');
    if (cached) {
      const list: Booking[] = JSON.parse(cached);
      const updated = list.map(b => b.id === bookingId ? { ...b, isValidated: true, validatedAt } : b);
      localStorage.setItem('bus_bookings', JSON.stringify(updated));
    }
  }
};

// ===========================================================================
// AUDIT TRAIL — TAMPER-EVIDENT HASH CHAIN
// ===========================================================================

/**
 * Retrieves the audit ledger in chronological order.
 *
 * Ascending order is essential rather than cosmetic: each entry's hash is
 * computed from the previous entry's hash, so the chain is only verifiable
 * when read oldest-first. (The regulator page reverses a copy for display, to
 * show the most recent activity at the top.)
 */
export const getAuditLogs = async (): Promise<AuditLog[]> => {
  if (supabase) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: true });

    if (!error && data) {
      return data.map(item => ({
        id: item.id,
        timestamp: item.timestamp || new Date().toISOString(),
        actor: (item.actor as any) || 'system',
        action: item.action,
        details: item.details,
        hash: item.hash
      }));
    }
  }

  if (!isBrowser) return [];
  const cached = localStorage.getItem('bus_audit_logs');
  return cached ? JSON.parse(cached) : [];
};

/**
 * Appends an event to the tamper-evident audit ledger.
 *
 * PURPOSE (the revenue-leakage problem)
 * -------------------------------------
 * Because operators self-report their takings, a regulator has no independent
 * record of what was actually sold, and under-reporting is difficult to
 * detect. This ledger records every booking, dispatch and gate scan as it
 * happens, giving the regulator an authoritative parallel record.
 *
 * HOW THE HASH CHAIN WORKS (a simplified blockchain)
 * -------------------------------------------------
 * Each entry's hash is computed over its own contents PLUS the hash of the
 * entry before it:
 *
 *     hash(n) = H( hash(n-1) + actor + action + details + timestamp )
 *
 * This creates a dependency chain: entry 3's hash depends on entry 2's, which
 * depends on entry 1's. Altering a historical entry — say, reducing a recorded
 * fare — changes its hash, which no longer matches the value the next entry was
 * built from, and the break propagates through every subsequent entry. An
 * auditor recomputing the chain sees exactly where it diverges.
 *
 * The property provided is TAMPER EVIDENCE, not tamper prevention: records can
 * still be edited, but not without leaving detectable traces.
 *
 * ACADEMIC LIMITATION: like the ticket signature, this uses a 32-bit djb2-style
 * hash rather than SHA-256, and is zero-padded to 24 characters so it merely
 * resembles a cryptographic digest. It demonstrates the chaining principle
 * faithfully, but a real deployment would need a collision-resistant hash —
 * otherwise an attacker could craft replacement content producing a matching
 * hash. Note also that entries are written by the same application they audit;
 * genuine independence would require the regulator to hold the ledger.
 *
 * @param actor   Which party caused the event.
 * @param action  Machine-readable event type. The regulator page flags entries
 *                containing 'security', 'mismatch' or 'duplicate' as incidents,
 *                so these substrings are significant.
 * @param details Human-readable description shown in the ledger.
 */
export const addAuditLog = async (actor: AuditLog['actor'], action: string, details: string): Promise<void> => {
  // Fetch the existing chain so the newest entry can be linked to its tail.
  const logs = await getAuditLogs();

  // The genesis value: a fixed string of zeros used when the ledger is empty,
  // giving the very first entry something deterministic to chain from.
  const lastHash = logs.length > 0 ? logs[logs.length - 1].hash : '000000000000000000000000';

  // The previous hash is placed FIRST in the concatenation — this is what
  // binds the new entry to the chain. Date.now() ensures two otherwise
  // identical events still produce distinct hashes.
  const combined = lastHash + actor + action + details + Date.now();

  // Same djb2-style rolling hash used for ticket signatures; see the detailed
  // explanation in services/algorithms.ts.
  let hashVal = 0;
  for (let i = 0; i < combined.length; i++) {
    hashVal = (hashVal << 5) - hashVal + combined.charCodeAt(i);
    hashVal |= 0; // clamp to a 32-bit signed integer
  }
  // Padded to a uniform 24 characters so the ledger displays neatly aligned.
  const nextHash = Math.abs(hashVal).toString(16).padStart(24, '0');

  const newLog: AuditLog = {
    // Timestamp plus a random suffix, guarding against collisions when several
    // events are logged within the same millisecond (e.g. a multi-seat booking).
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    details,
    hash: nextHash
  };

  if (supabase) {
    const { error } = await supabase.from('audit_logs').insert({
      id: newLog.id,
      actor: newLog.actor,
      action: newLog.action,
      details: newLog.details,
      hash: newLog.hash,
      timestamp: newLog.timestamp
    });
    if (!error) return;
  }

  if (isBrowser) {
    // `logs` already holds the full chain fetched above, so appending and
    // rewriting preserves the ordering the hash chain depends on.
    logs.push(newLog);
    localStorage.setItem('bus_audit_logs', JSON.stringify(logs));
  }
};
