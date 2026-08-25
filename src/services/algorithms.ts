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
  // --- PHASE 0: VALIDATE THE ENDPOINTS -----------------------------------
  // Both identifiers must name actual vertices. This guard is not cosmetic:
  // `previous` is only populated for known cities, so an unknown endId would
  // make the reconstruction loop in phase 4 read `undefined` rather than
  // `null` and spin forever, freezing the browser tab rather than reporting
  // "no route". The dropdowns in the UI cannot currently produce an unknown
  // code, but a stale saved link or a route record naming a retired terminal
  // could.
  const knownNodes = new Set(TRANSIT_GRAPH_NODES.map(node => node.id));
  if (!knownNodes.has(startId) || !knownNodes.has(endId)) {
    return { path: [], totalDistance: 0, totalTimeMins: 0 };
  }

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
  const walked = new Set<string>(); // defends against a malformed breadcrumb cycle
  let curr: string | null = endId;
  while (curr !== null && !walked.has(curr)) {
    walked.add(curr);
    path.unshift(curr);
    // Coalesce undefined to null: a missing key must end the walk, not
    // continue it with an undefined cursor.
    curr = previous[curr] ?? null;
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
// IMPLEMENTATION NOTE — SCHEME AND ITS REMAINING LIMITATION
// ---------------------------------------------------------------------------
// The scheme is HMAC-SHA256 (Krawczyk, Bellare and Canetti, 1997), computed
// over the four ticket fields with a shared secret key. Both SHA-256 and the
// HMAC construction are implemented from first principles below rather than
// imported, consistently with the rest of this module, so that an examiner can
// inspect every step of the computation.
//
// An earlier build of this prototype used a 32-bit djb2 string hash with the
// key appended to the message. That construction was replaced because it had
// two defects that undermined the integrity claim the artefact makes:
//
//   1. A 32-bit digest admits only ~4.3 billion distinct signatures, so a
//      colliding payload can be found by brute force in seconds on commodity
//      hardware. SHA-256 raises the digest to 256 bits.
//   2. Appending a key to a message (H(m || k)) is not an HMAC. HMAC's nested
//      inner/outer padding construction is what yields a provably secure
//      message authentication code under the assumption that the compression
//      function behaves as a pseudo-random function.
//
// ONE LIMITATION REMAINS, AND IT IS INHERENT TO A BROWSER PROTOTYPE:
//
//   * The secret key is embedded in client-side JavaScript and is therefore
//     readable by anyone who inspects the bundle. Since the whole point of the
//     scheme is that gate devices verify without a network, a symmetric key
//     must reach those devices somehow, and in a browser-only prototype there
//     is nowhere to hide it. A real deployment would either provision gate
//     devices with the key through a secure channel and keep it out of the
//     passenger-facing bundle, or move to asymmetric signatures (Ed25519), so
//     that gate devices hold only a public verification key and a stolen
//     device leaks nothing that would let an attacker mint tickets.
//
// The offline verification WORKFLOW being demonstrated is identical under
// either key-management regime. Only the provisioning differs.
// ---------------------------------------------------------------------------

/**
 * Shared secret used to sign and verify tickets.
 *
 * See the limitation note above: in this prototype the key necessarily ships
 * to the client. It is isolated here as a single named constant so that a
 * deployment can replace it with a securely provisioned value without touching
 * the signing logic.
 */
const TICKET_SIGNING_KEY = 'GhanaTBSSecretKey2026';

// --- SHA-256, implemented from first principles ----------------------------
// Reference: FIPS PUB 180-4, Secure Hash Standard (NIST, 2015), section 6.2.

/**
 * The 64 round constants of SHA-256: the first 32 bits of the fractional parts
 * of the cube roots of the first 64 primes.
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/** Rotate a 32-bit word right by n bits. */
const rotr32 = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/**
 * Encodes a string as UTF-8 bytes.
 *
 * Written explicitly rather than using TextEncoder so that the byte sequence
 * being hashed is visible in this file. Ghanaian passenger names may carry
 * characters outside ASCII, so multi-byte sequences and surrogate pairs are
 * both handled; hashing the wrong bytes would make a ticket unverifiable on a
 * device with a different string representation.
 */
const utf8Bytes = (input: string): Uint8Array => {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate. It is only half a character: it must be followed by a
      // low surrogate (0xDC00-0xDFFF) to form one code point above the Basic
      // Multilingual Plane. The pairing is checked BEFORE consuming the next
      // character, because a high surrogate followed by an ordinary character
      // is malformed input, and consuming that character unconditionally would
      // silently drop it from the signed payload.
      const low = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        i++; // consume the low surrogate, which belongs to this code point
        const cp = 0x10000 + ((code & 0x3ff) << 10) + (low & 0x3ff);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        // Unpaired high surrogate: emit U+FFFD REPLACEMENT CHARACTER.
        out.push(0xef, 0xbf, 0xbd);
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Unpaired low surrogate (a low surrogate not preceded by a high one).
      out.push(0xef, 0xbf, 0xbd);
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(out);
};

/**
 * Computes the SHA-256 digest of a byte array, returning 32 raw bytes.
 *
 * The four stages follow FIPS 180-4 directly:
 *   1. PAD        — append 0x80, then zeros, then the message length in bits
 *                   as a 64-bit big-endian integer, so the total is a multiple
 *                   of 64 bytes.
 *   2. SCHEDULE   — expand each 64-byte block into 64 32-bit words.
 *   3. COMPRESS   — run 64 rounds mixing the eight working variables.
 *   4. ACCUMULATE — add the working variables back into the running state.
 */
const sha256 = (input: Uint8Array): Uint8Array => {
  // Initial state: first 32 bits of the fractional parts of the square roots
  // of the first eight primes.
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);

  // --- STAGE 1: PADDING ---
  // The length in bits occupies a 64-bit field. Round the padded length up to
  // the next multiple of 64 bytes, leaving room for the 0x80 marker byte and
  // the 8 length bytes.
  const bitLength = input.length * 8;
  const paddedLength = (input.length + 9 + 63) & ~63;
  const msg = new Uint8Array(paddedLength);
  msg.set(input);
  msg[input.length] = 0x80;

  const view = new DataView(msg.buffer);
  // Split the bit length across two 32-bit words, since JavaScript bitwise
  // operators are 32-bit and would truncate a large length.
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    // --- STAGE 2: MESSAGE SCHEDULE ---
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    // --- STAGE 3: COMPRESSION ---
    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }

    // --- STAGE 4: ACCUMULATE ---
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  // Serialise the eight state words as 32 big-endian bytes.
  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) {
    digestView.setUint32(i * 4, H[i]);
  }
  return digest;
};

/**
 * Computes HMAC-SHA256 over a message with a secret key (RFC 2104).
 *
 * The construction is  H((K XOR opad) || H((K XOR ipad) || message)).
 *
 * The two padding constants and the nested hashing are what distinguish a real
 * MAC from naively appending a key to a message. Because the key is mixed into
 * both an inner and an outer hash, an attacker who observes a valid
 * (message, tag) pair cannot extend the message and compute a matching tag,
 * which is exactly the length-extension attack that defeats H(key || message).
 */
const hmacSha256 = (key: string, message: string): Uint8Array => {
  const BLOCK_SIZE = 64; // SHA-256 operates on 64-byte blocks

  // Normalise the key to exactly one block: hash it if too long, zero-pad if short.
  let keyBytes = utf8Bytes(key);
  if (keyBytes.length > BLOCK_SIZE) {
    keyBytes = sha256(keyBytes);
  }
  const paddedKey = new Uint8Array(BLOCK_SIZE);
  paddedKey.set(keyBytes);

  const inner = new Uint8Array(BLOCK_SIZE);
  const outer = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    inner[i] = paddedKey[i] ^ 0x36; // ipad
    outer[i] = paddedKey[i] ^ 0x5c; // opad
  }

  // Inner hash: H((K XOR ipad) || message)
  const messageBytes = utf8Bytes(message);
  const innerInput = new Uint8Array(BLOCK_SIZE + messageBytes.length);
  innerInput.set(inner);
  innerInput.set(messageBytes, BLOCK_SIZE);
  const innerDigest = sha256(innerInput);

  // Outer hash: H((K XOR opad) || innerDigest)
  const outerInput = new Uint8Array(BLOCK_SIZE + innerDigest.length);
  outerInput.set(outer);
  outerInput.set(innerDigest, BLOCK_SIZE);
  return sha256(outerInput);
};

/** Renders raw bytes as an uppercase hexadecimal string. */
const toHex = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out.toUpperCase();
};

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
 * Computes the HMAC-SHA256 signature for a set of ticket details.
 *
 * Used in two places, and the symmetry between them is the whole point of the
 * scheme:
 *   - at BOOKING time, to stamp a signature onto a newly issued ticket;
 *   - at GATE time, to recompute the expected signature from a scanned ticket.
 *
 * The function is deterministic — identical inputs always yield an identical
 * signature — which is what allows the gate to verify without contacting the
 * server that issued the ticket.
 *
 * FIELD SEPARATION: the four fields are joined with the unit separator
 * character (U+001F) rather than a hyphen. Hyphens occur inside bus numbers
 * and passenger names, which would make a hyphen-joined encoding ambiguous:
 * the field sets ("A-1", 2) and ("A", "1-2") would serialise identically and
 * therefore share a signature, letting one ticket's tag authenticate another's
 * details. The unit separator cannot be typed into the booking form, so every
 * field boundary is unambiguous.
 *
 * @returns a 64-character uppercase hex string (a 256-bit tag).
 */
export const generateOfflineSignature = (
  ticketId: string,
  passengerName: string,
  seatNumber: number,
  busNumber: string
): string => {
  const SEPARATOR = '\u001F';
  const payload = [ticketId, passengerName, String(seatNumber), busNumber].join(SEPARATOR);
  return toHex(hmacSha256(TICKET_SIGNING_KEY, payload));
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
