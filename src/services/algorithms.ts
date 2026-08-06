/**
 * ============================================================================
 * algorithms.ts — CORE ALGORITHMIC CONTRIBUTIONS OF THE DISSERTATION
 * ============================================================================
 *
 * This module is the computational heart of the prototype. Everything else in
 * the codebase (pages, database access, UI) exists to feed data into these
 * three algorithms and to display their output. The three algorithms each
 * address a distinct socio-technical constraint identified in the Ghanaian
 * intercity transport context:
 *
 *   1. DIJKSTRA'S SHORTEST PATH  — route optimisation across the transit
 *      network. Answers "what is the cheapest way to get from A to B, and how
 *      far / how long is it?" Used by the commuter portal (src/app/page.tsx).
 *
 *   2. DYNAMIC RATE LEAKY BUCKET — dispatch scheduling. Ghanaian operators use
 *      an informal "fill-and-go" model rather than fixed timetables, so
 *      departures cannot be modelled as a static schedule. This models the bus
 *      as a bucket that fills with passengers and "leaks" (departs) on
 *      reaching a threshold. Used by the operator dashboard
 *      (src/app/operator/page.tsx).
 *
 *   3. OFFLINE QR TICKET SIGNATURE — ticket authentication without network
 *      access. Cellular coverage at crowded terminals is unreliable, so gate
 *      staff cannot depend on a live database lookup to check a ticket. Used
 *      by the gate scanner (src/app/gate/page.tsx).
 *
 * All three are deliberately implemented from first principles rather than
 * pulled from a library, so that the logic is inspectable and assessable.
 */

import { Route, Schedule } from './database';

// ===========================================================================
// ALGORITHM 1: DIJKSTRA'S SHORTEST PATH
// ===========================================================================
// Ghana's intercity network is modelled as a weighted undirected graph.
// Cities are vertices (nodes); the roads between them are edges carrying two
// weights: physical distance and average travel time.
//
// Node IDs are three-letter abbreviations used consistently throughout the
// application, so the UI can pass them straight into the solver:
//   Acc = Accra, Kum = Kumasi, Tam = Tamale, Tak = Takoradi,
//   Sun = Sunyani, Ho = Ho, Cap = Cape Coast

/** A single city / terminal in the transit network (a graph vertex). */
export interface GraphNode {
  id: string;   // short code used as the key in all lookups, e.g. 'Acc'
  name: string; // human-readable label shown in the UI, e.g. 'Accra (Circle)'
}

/**
 * A road connecting two cities (a graph edge).
 *
 * Edges are treated as UNDIRECTED: an edge listed as Accra -> Kumasi is also
 * traversable Kumasi -> Accra. This reflects reality (the road runs both ways)
 * and halves the amount of data that must be declared below.
 */
export interface GraphEdge {
  from: string;
  to: string;
  distanceKm: number;  // edge weight used for the shortest-path calculation
  avgTimeMins: number; // secondary weight, accumulated alongside distance
}

/** The vertex set: every city the prototype can route between. */
export const TRANSIT_GRAPH_NODES: GraphNode[] = [
  { id: 'Acc', name: 'Accra (Circle)' },
  { id: 'Kum', name: 'Kumasi (Kejetia)' },
  { id: 'Tam', name: 'Tamale' },
  { id: 'Tak', name: 'Takoradi' },
  { id: 'Sun', name: 'Sunyani' },
  { id: 'Ho', name: 'Ho' },
  { id: 'Cap', name: 'Cape Coast' }
];

/**
 * The edge set: the roads of the network, with real-world approximate
 * distances and journey times.
 *
 * Note that this graph is deliberately SPARSE — not every city is directly
 * connected to every other. This is what makes the shortest-path search
 * non-trivial and worth running. For example there is no direct Accra ->
 * Takoradi edge, so the algorithm must discover the two-hop route
 * Accra -> Cape Coast -> Takoradi (145 + 75 = 220 km) on its own. Likewise
 * Accra -> Tamale must be resolved via Kumasi.
 */
export const TRANSIT_GRAPH_EDGES: GraphEdge[] = [
  { from: 'Acc', to: 'Kum', distanceKm: 270, avgTimeMins: 270 }, // 4.5 hours
  { from: 'Acc', to: 'Cap', distanceKm: 145, avgTimeMins: 150 }, // 2.5 hours
  { from: 'Cap', to: 'Tak', distanceKm: 75, avgTimeMins: 90 },   // 1.5 hours
  { from: 'Acc', to: 'Ho', distanceKm: 160, avgTimeMins: 180 },  // 3 hours
  { from: 'Kum', to: 'Tam', distanceKm: 380, avgTimeMins: 360 }, // 6 hours
  { from: 'Kum', to: 'Sun', distanceKm: 120, avgTimeMins: 120 }, // 2 hours
  { from: 'Sun', to: 'Tam', distanceKm: 310, avgTimeMins: 300 }  // 5 hours
];

/**
 * Computes the minimum-distance route between two cities using Dijkstra's
 * algorithm.
 *
 * HOW THE ALGORITHM WORKS (classic Dijkstra, four phases):
 *   1. INITIALISE  — assume every city is unreachable (distance = Infinity)
 *                    except the starting city, which costs 0 to reach.
 *   2. SELECT      — repeatedly pick the unvisited city with the smallest
 *                    known distance. Dijkstra's key insight is that this
 *                    city's distance is now final and cannot be improved.
 *   3. RELAX       — for each neighbour of that city, check whether routing
 *                    via the current city is cheaper than the best route
 *                    found so far. If so, record the improvement.
 *   4. RECONSTRUCT — walk the `previous` breadcrumbs backwards from the
 *                    destination to recover the actual sequence of cities.
 *
 * COMPLEXITY: this implementation uses a linear scan to find the minimum in
 * step 2, giving O(V^2 + E). A binary-heap priority queue would reduce this to
 * O((V + E) log V), but with only 7 cities the simpler form is clearer to read
 * and the difference is immeasurable at this scale.
 *
 * @param startId Origin city code, e.g. 'Acc'
 * @param endId   Destination city code, e.g. 'Tam'
 * @returns The ordered list of cities to travel through, plus the total
 *          distance and estimated duration. If no route exists, `path` is an
 *          empty array and both totals are 0.
 */
export const calculateShortestPath = (startId: string, endId: string): {
  path: string[];
  totalDistance: number;
  totalTimeMins: number;
} => {
  // --- PHASE 1: INITIALISATION ------------------------------------------
  const distances: { [key: string]: number } = {};      // best known km to each city
  const times: { [key: string]: number } = {};          // travel minutes along that same best route
  const previous: { [key: string]: string | null } = {}; // breadcrumb: which city we arrived from
  const nodes = new Set<string>();                       // the "unvisited" set

  // Every city starts as unreachable with no known predecessor.
  TRANSIT_GRAPH_NODES.forEach(node => {
    distances[node.id] = Infinity;
    times[node.id] = Infinity;
    previous[node.id] = null;
    nodes.add(node.id);
  });

  // The origin is the one exception: it costs nothing to reach itself.
  distances[startId] = 0;
  times[startId] = 0;

  while (nodes.size > 0) {
    // --- PHASE 2: SELECT THE CLOSEST UNVISITED CITY ---------------------
    // Linear scan over the unvisited set to find the smallest tentative
    // distance. This is the "greedy" choice at the core of Dijkstra.
    let minNode: string | null = null;
    nodes.forEach(node => {
      if (minNode === null || distances[node] < distances[minNode]) {
        minNode = node;
      }
    });

    // Termination case A: every remaining city is unreachable from the
    // origin (the graph is disconnected), so no further progress is possible.
    if (minNode === null || distances[minNode] === Infinity) break;
    // Termination case B: we have reached the destination. Its distance is
    // now provably final, so there is no need to explore the rest of the graph.
    if (minNode === endId) break;

    // Mark this city as visited by removing it from the unvisited set.
    nodes.delete(minNode);

    // --- PHASE 3: RELAX THE EDGES OF THE CHOSEN CITY --------------------
    // Copied into a const because TypeScript cannot narrow the type of a
    // `let` variable inside the closures below.
    const currentMinNode = minNode;

    // Because edges are undirected, a city is a neighbour if it appears on
    // EITHER end of the edge — hence the two-sided comparison.
    const neighbors = TRANSIT_GRAPH_EDGES.filter(
      edge => edge.from === currentMinNode || edge.to === currentMinNode
    );

    neighbors.forEach(edge => {
      // Whichever end of the edge is not the current city is the neighbour.
      const neighbor = edge.from === currentMinNode ? edge.to : edge.from;

      // Skip already-finalised cities; their distances cannot be improved.
      if (!nodes.has(neighbor)) return;

      // Cost of reaching the neighbour by going through the current city.
      const altDistance = distances[currentMinNode] + edge.distanceKm;
      const altTime = times[currentMinNode] + edge.avgTimeMins;

      // If this detour beats the best route found so far, record it.
      // Travel time is carried along the same winning path rather than being
      // minimised independently, so the reported duration always corresponds
      // to the distance-optimal route actually being recommended.
      if (altDistance < distances[neighbor]) {
        distances[neighbor] = altDistance;
        times[neighbor] = altTime;
        previous[neighbor] = currentMinNode;
      }
    });
  }

  // --- PHASE 4: RECONSTRUCT THE PATH ------------------------------------
  // Follow the breadcrumb trail backwards from destination to origin, using
  // unshift() so the final array reads forwards (origin first).
  const path: string[] = [];
  let curr: string | null = endId;
  while (curr !== null) {
    path.unshift(curr);
    curr = previous[curr];
  }

  return {
    // Sanity check: if the reconstructed trail does not begin at the origin,
    // the destination was never reached, so report "no route" rather than a
    // misleading partial path.
    path: path[0] === startId ? path : [],
    // Infinity means unreachable; surface it as 0 so the UI can render a
    // number rather than the literal text "Infinity".
    totalDistance: distances[endId] === Infinity ? 0 : distances[endId],
    totalTimeMins: times[endId] === Infinity ? 0 : times[endId]
  };
};


// ===========================================================================
// ALGORITHM 2: DYNAMIC RATE LEAKY BUCKET (DISPATCH SCHEDULING)
// ===========================================================================
// PROBLEM: European-style booking systems assume a fixed timetable — a bus
// leaves at 08:00 whether it holds 5 passengers or 50. Ghanaian intercity
// operators instead use an informal "fill-and-go" model: the bus departs when
// it is close to full. A booking system that displays rigid departure times
// would therefore be lying to passengers.
//
// SOLUTION: borrow the leaky bucket, a classic network traffic-shaping
// algorithm, and re-purpose it for physical passenger flow:
//
//   Networking concept      ->  Transport equivalent in this model
//   ---------------------       ----------------------------------
//   bucket                  ->  the bus
//   bucket capacity         ->  total seats on the bus
//   water arriving          ->  passengers making bookings
//   arrival rate            ->  booking velocity (passengers per hour)
//   bucket leaking          ->  the bus departing the terminal
//   overflow                ->  terminal congestion (passengers with nowhere to go)
//
// The practical output is a CONTINUOUSLY RECALCULATED departure estimate: as
// bookings arrive faster, the predicted departure moves closer. This gives
// passengers an honest estimate and gives operators an early warning of
// terminal crowding.

/** The computed state of one bus modelled as a leaky bucket. */
export interface LeakyBucketStatus {
  arrivalRatePerMin: number;           // inflow: passengers booking per minute
  bucketLevel: number;                 // current fill: seats already booked
  leakThreshold: number;               // fill level at which the bus departs
  estimatedMinutesToDeparture: number; // projected wait, recalculated from the inflow rate
  congestionIndex: number;             // 0..1 measure of how crowded the terminal is
}

/**
 * Evaluates the dispatch state of a single scheduled bus.
 *
 * This is a pure function: it reads the schedule and the current booking rate
 * and returns a snapshot of the model. It performs no I/O and mutates nothing,
 * which means the operator dashboard can re-run it on every render (for
 * example each time the velocity slider moves) with no side effects.
 *
 * @param schedule        The bus being evaluated; its `reservedSeats` array
 *                        supplies the current bucket level.
 * @param bookingVelocity Rate at which passengers are booking, in passengers
 *                        per hour. On the operator dashboard this is driven by
 *                        a slider so the examiner can observe how the departure
 *                        estimate responds to demand.
 */
export const runLeakyBucketSimulation = (
  schedule: Schedule,
  bookingVelocity: number
): LeakyBucketStatus => {
  const currentBookingsCount = schedule.reservedSeats.length; // current bucket level
  const totalSeats = schedule.totalSeats;                     // bucket capacity

  // The "leak" trigger. Set at 85% rather than 100% because operators in
  // practice depart once the bus is nearly full rather than holding it for the
  // final few seats — waiting for a 100% fill would leave buses idling and is
  // precisely the behaviour that causes terminal congestion.
  const leakThreshold = Math.floor(totalSeats * 0.85);

  // Convert the hourly booking rate into a per-minute inflow, since the
  // departure estimate is reported in minutes.
  const arrivalRatePerMin = bookingVelocity / 60;

  // How many more passengers are needed before the bus can depart.
  // Clamped at 0 so an already-full bus never yields a negative figure.
  const remainingSeatsToThreshold = Math.max(0, leakThreshold - currentBookingsCount);

  // Project the departure time: (passengers still needed) / (passengers per minute).
  let estimatedMinutesToDeparture = 0;
  if (currentBookingsCount >= leakThreshold) {
    // Threshold already met — the bucket is ready to leak now.
    estimatedMinutesToDeparture = 0;
  } else if (arrivalRatePerMin > 0) {
    // Standard case: linear projection from the current inflow rate.
    estimatedMinutesToDeparture = Math.round(remainingSeatsToThreshold / arrivalRatePerMin);
  } else {
    // Guard against division by zero when no bookings are arriving at all.
    // A fixed 2-hour placeholder is shown instead of an infinite wait, since
    // in practice an operator would eventually dispatch a part-full bus.
    estimatedMinutesToDeparture = 120;
  }

  // Terminal congestion index, normalised to 0..1 for easy display as a
  // percentage. Modelled as the proportion of seats that are booked but not
  // yet dispatched: those passengers are physically waiting at the terminal,
  // so the fuller the bucket, the more crowded the terminal.
  const congestionIndex = Math.min(1, currentBookingsCount / totalSeats);

  return {
    arrivalRatePerMin,
    bucketLevel: currentBookingsCount,
    leakThreshold,
    estimatedMinutesToDeparture,
    congestionIndex
  };
};


// ===========================================================================
// ALGORITHM 3: OFFLINE QR TICKET SIGNATURE SYSTEM
// ===========================================================================
// PROBLEM: at busy Ghanaian terminals cellular coverage is unreliable. If gate
// staff had to query a central database to check each ticket, boarding would
// stall exactly when the terminal is most crowded — the very congestion this
// project sets out to reduce.
//
// SOLUTION: make the ticket self-verifying. Rather than storing a meaningless
// reference number that must be looked up remotely, the QR code carries the
// full ticket details PLUS a signature derived from those details and a shared
// secret key. The gate device recomputes the signature from the scanned
// details and compares. If they match, the ticket was issued by the system and
// has not been altered since — a conclusion reached with NO network access.
//
// The security property being demonstrated is INTEGRITY (detecting tampering),
// not confidentiality. Ticket contents are deliberately readable; what matters
// is that they cannot be modified without invalidating the signature. Changing
// even one character of the passenger name or seat number produces a completely
// different signature, so forged and edited tickets are both rejected.
//
// ---------------------------------------------------------------------------
// ACADEMIC LIMITATION — IMPORTANT, PLEASE READ
// ---------------------------------------------------------------------------
// This is a FUNCTIONAL SIMULATION of a signing scheme, not a production-grade
// one. It demonstrates the offline verification WORKFLOW; it would not
// withstand a determined attacker. Three specific weaknesses:
//
//   1. The hash below is a 32-bit variant of the well-known djb2 string hash,
//      not a true cryptographic hash such as SHA-256. Only ~4 billion distinct
//      signatures are possible, so collisions can be found by brute force.
//   2. The secret key is embedded in client-side JavaScript and is therefore
//      readable by anyone who inspects the bundle. A real deployment would keep
//      the signing key on a server and provision gate devices with it securely.
//   3. This is a keyed hash, not a real HMAC — it lacks HMAC's inner/outer
//      padding construction, which is what protects against length-extension
//      attacks.
//
// A production system would use the Web Crypto API (crypto.subtle) with
// HMAC-SHA256, or asymmetric signatures (Ed25519) so that gate devices only
// need a public verification key and a stolen device leaks nothing. The
// workflow demonstrated here would be unchanged; only the hash function and
// key management would differ.
// ---------------------------------------------------------------------------

/**
 * Shared secret used to sign and verify tickets.
 * Named MOCK_ to signal that this is a stand-in for a securely provisioned key
 * — see limitation (2) above.
 */
const MOCK_SECRET_KEY = 'GhanaTBSSecretKey2026';

/**
 * The complete data structure encoded into a ticket's QR code.
 * Everything a gate officer needs is present in the payload itself, which is
 * exactly what makes offline verification possible.
 */
export interface QRData {
  ticketId: string;
  passengerName: string;
  seatNumber: number;
  busNumber: string;
  signature: string; // the tamper-detection value computed over the four fields above
}

/**
 * Computes the signature for a set of ticket details.
 *
 * Used in two places, and the symmetry between them is the whole point of the
 * scheme:
 *   - at BOOKING time, to stamp a signature onto a newly issued ticket;
 *   - at GATE time, to recompute the expected signature from a scanned ticket.
 *
 * The function is deterministic — identical inputs always yield an identical
 * signature — which is what allows the gate to verify without contacting the
 * server that issued the ticket.
 */
export const generateOfflineSignature = (
  ticketId: string,
  passengerName: string,
  seatNumber: number,
  busNumber: string
): string => {
  // All four ticket fields are concatenated with the secret key appended.
  // Including the key is what prevents forgery: an attacker who does not know
  // the key cannot produce a signature that will verify, even though they can
  // read the ticket contents.
  const payload = `${ticketId}-${passengerName}-${seatNumber}-${busNumber}-${MOCK_SECRET_KEY}`;

  // djb2-style rolling hash. For each character:
  //   hash = hash * 31 + charCode
  // written as (hash << 5) - hash, since (h * 32) - h == h * 31 and bit shifts
  // are the conventional formulation of this algorithm.
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    // JavaScript numbers are 64-bit floats, so this forces the accumulator back
    // into a 32-bit signed integer on every iteration. Without it the hash
    // would lose precision and stop being reproducible across devices.
    hash = hash & hash;
  }

  // Math.abs() discards the sign (the accumulator can go negative through
  // overflow) and the result is rendered as uppercase hex for a compact,
  // human-readable signature suitable for printing on a ticket.
  return Math.abs(hash).toString(16).toUpperCase();
};

/**
 * Verifies a scanned ticket entirely offline.
 *
 * Recomputes the signature from the four scanned detail fields and compares it
 * against the signature the ticket claims. A mismatch means the payload was
 * altered after issue, or was fabricated by someone without the secret key.
 *
 * NOTE ON SCOPE: this proves the ticket is AUTHENTIC, not that it is UNUSED.
 * Detecting a passenger presenting the same valid ticket twice requires local
 * state, which is handled separately by the gate scanner page — see the
 * duplicate-scan check in src/app/gate/page.tsx.
 *
 * @returns true if the ticket is genuine and unmodified.
 */
export const verifyOfflineTicket = (qrData: QRData): boolean => {
  const calculatedSignature = generateOfflineSignature(
    qrData.ticketId,
    qrData.passengerName,
    qrData.seatNumber,
    qrData.busNumber
  );
  // Note: a plain string comparison. Production code verifying signatures
  // should use a constant-time comparison to avoid leaking information through
  // timing, though that is not a meaningful threat for a physical gate device.
  return calculatedSignature === qrData.signature;
};
