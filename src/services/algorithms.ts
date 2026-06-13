import { Route, Schedule } from './database';

// 1. Dijkstra's Shortest Path Algorithm
// Representing Ghana's main transit nodes as a graph
// Acc (Accra), Kum (Kumasi), Tam (Tamale), Tak (Takoradi), Sun (Sunyani), Ho (Ho)
export interface GraphNode {
  id: string;
  name: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  distanceKm: number;
  avgTimeMins: number;
}

export const TRANSIT_GRAPH_NODES: GraphNode[] = [
  { id: 'Acc', name: 'Accra (Circle)' },
  { id: 'Kum', name: 'Kumasi (Kejetia)' },
  { id: 'Tam', name: 'Tamale' },
  { id: 'Tak', name: 'Takoradi' },
  { id: 'Sun', name: 'Sunyani' },
  { id: 'Ho', name: 'Ho' }
];

export const TRANSIT_GRAPH_EDGES: GraphEdge[] = [
  { from: 'Acc', to: 'Kum', distanceKm: 270, avgTimeMins: 270 }, // 4.5 hours
  { from: 'Acc', to: 'Tak', distanceKm: 220, avgTimeMins: 240 }, // 4 hours
  { from: 'Acc', to: 'Ho', distanceKm: 160, avgTimeMins: 180 },  // 3 hours
  { from: 'Kum', to: 'Tam', distanceKm: 380, avgTimeMins: 360 }, // 6 hours
  { from: 'Kum', to: 'Sun', distanceKm: 120, avgTimeMins: 120 }, // 2 hours
  { from: 'Sun', to: 'Tam', distanceKm: 310, avgTimeMins: 300 }  // 5 hours
];

// Dijkstra calculation
export const calculateShortestPath = (startId: string, endId: string): {
  path: string[];
  totalDistance: number;
  totalTimeMins: number;
} => {
  const distances: { [key: string]: number } = {};
  const times: { [key: string]: number } = {};
  const previous: { [key: string]: string | null } = {};
  const nodes = new Set<string>();

  TRANSIT_GRAPH_NODES.forEach(node => {
    distances[node.id] = Infinity;
    times[node.id] = Infinity;
    previous[node.id] = null;
    nodes.add(node.id);
  });

  distances[startId] = 0;
  times[startId] = 0;

  while (nodes.size > 0) {
    // Find node with minimum distance
    let minNode: string | null = null;
    nodes.forEach(node => {
      if (minNode === null || distances[node] < distances[minNode]) {
        minNode = node;
      }
    });

    if (minNode === null || distances[minNode] === Infinity) break;
    if (minNode === endId) break;

    nodes.delete(minNode);

    // Get neighbors of minNode
    const currentMinNode = minNode; // variable binding for closure safety
    const neighbors = TRANSIT_GRAPH_EDGES.filter(
      edge => edge.from === currentMinNode || edge.to === currentMinNode
    );

    neighbors.forEach(edge => {
      const neighbor = edge.from === currentMinNode ? edge.to : edge.from;
      if (!nodes.has(neighbor)) return;

      const altDistance = distances[currentMinNode] + edge.distanceKm;
      const altTime = times[currentMinNode] + edge.avgTimeMins;

      if (altDistance < distances[neighbor]) {
        distances[neighbor] = altDistance;
        times[neighbor] = altTime;
        previous[neighbor] = currentMinNode;
      }
    });
  }

  // Reconstruct path
  const path: string[] = [];
  let curr: string | null = endId;
  while (curr !== null) {
    path.unshift(curr);
    curr = previous[curr];
  }

  return {
    path: path[0] === startId ? path : [],
    totalDistance: distances[endId] === Infinity ? 0 : distances[endId],
    totalTimeMins: times[endId] === Infinity ? 0 : times[endId]
  };
};


// 2. Dynamic Rate Leaky Bucket Algorithm for Dispatch Scheduling
// Models terminal congestion and arrival velocity
export interface LeakyBucketStatus {
  arrivalRatePerMin: number;      // velocity of incoming bookings
  bucketLevel: number;            // current passenger filling level (e.g. seats booked)
  leakThreshold: number;          // seat threshold to trigger bus leakage (dispatch)
  estimatedMinutesToDeparture: number; // dynamically recalculated time
  congestionIndex: number;        // 0 to 1 scale indicating terminal crowding
}

export const runLeakyBucketSimulation = (
  schedule: Schedule,
  bookingVelocity: number // booking arrival rate (passengers per hour)
): LeakyBucketStatus => {
  const currentBookingsCount = schedule.reservedSeats.length;
  const totalSeats = schedule.totalSeats;
  const leakThreshold = Math.floor(totalSeats * 0.85); // Dispatch when 85% full
  
  // Calculate passenger velocity per minute
  const arrivalRatePerMin = bookingVelocity / 60;
  
  // Calculate remaining seats to reach dispatch threshold
  const remainingSeatsToThreshold = Math.max(0, leakThreshold - currentBookingsCount);
  
  // Calculate time in minutes based on arrival velocity
  let estimatedMinutesToDeparture = 0;
  if (currentBookingsCount >= leakThreshold) {
    estimatedMinutesToDeparture = 0; // ready to dispatch
  } else if (arrivalRatePerMin > 0) {
    estimatedMinutesToDeparture = Math.round(remainingSeatsToThreshold / arrivalRatePerMin);
  } else {
    estimatedMinutesToDeparture = 120; // fallback if booking is idle
  }

  // Calculate terminal congestion index
  // High booking rate + slow dispatch = higher congestion.
  // We model terminal congestion as a factor of seats booked but not yet dispatched.
  const congestionIndex = Math.min(1, currentBookingsCount / totalSeats);

  return {
    arrivalRatePerMin,
    bucketLevel: currentBookingsCount,
    leakThreshold,
    estimatedMinutesToDeparture,
    congestionIndex
  };
};


// 3. Cryptographic Offline QR Ticket Signature System
// Generates a tamper-proof verification signature that can be verified completely offline
const MOCK_SECRET_KEY = 'AccraTransitSecretKey2026';

export interface QRData {
  ticketId: string;
  passengerName: string;
  seatNumber: number;
  busNumber: string;
  signature: string;
}

// Generate the encrypted offline signature
export const generateOfflineSignature = (
  ticketId: string,
  passengerName: string,
  seatNumber: number,
  busNumber: string
): string => {
  const payload = `${ticketId}-${passengerName}-${seatNumber}-${busNumber}-${MOCK_SECRET_KEY}`;
  
  // Simple deterministic cryptographic hashing algorithm (mock HMAC-SHA256)
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Return hexadecimal string of signature
  return Math.abs(hash).toString(16).toUpperCase();
};

// Validate a ticket payload completely offline
export const verifyOfflineTicket = (qrData: QRData): boolean => {
  const calculatedSignature = generateOfflineSignature(
    qrData.ticketId,
    qrData.passengerName,
    qrData.seatNumber,
    qrData.busNumber
  );
  return calculatedSignature === qrData.signature;
};
