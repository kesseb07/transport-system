export interface Operator {
  id: string;
  name: string;
  code: string;
  color: string;
}

export interface Route {
  id: string;
  origin: string;
  destination: string;
  distanceKm: number;
  baseFareGhs: number;
}

export interface Schedule {
  id: string;
  operatorId: string;
  routeId: string;
  busNumber: string;
  totalSeats: number;
  reservedSeats: number[];
  scheduledTime: string;
  estimatedDepartureTime: string;
  departureRatePerHour: number; // For leaky bucket
  status: 'scheduled' | 'boarding' | 'departed' | 'delayed';
}

export interface Booking {
  id: string;
  scheduleId: string;
  passengerName: string;
  passengerPhone: string;
  seatNumber: number;
  momoProvider: 'MTN' | 'Telecel' | 'AT';
  momoTransactionId: string;
  amountPaid: number;
  timestamp: string;
  qrPayload: string; // Cryptographic payload hash
  isValidated: boolean;
  validatedAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: 'passenger' | 'operator' | 'regulator' | 'system';
  action: string;
  details: string;
  hash: string; // Mock blockchain/tamper-proof linkage hash
}

export const OPERATORS: Operator[] = [
  { id: 'op-vip', name: 'VIP Jeoun', code: 'VIP', color: '#ef4444' },
  { id: 'op-stc', name: 'Intercity STC', code: 'STC', color: '#1d4ed8' }
];

export const ROUTES: Route[] = [
  { id: 'rt-acc-kum', origin: 'Accra', destination: 'Kumasi', distanceKm: 270, baseFareGhs: 120 },
  { id: 'rt-acc-tam', origin: 'Accra', destination: 'Tamale', distanceKm: 620, baseFareGhs: 240 },
  { id: 'rt-acc-tak', origin: 'Accra', destination: 'Takoradi', distanceKm: 220, baseFareGhs: 100 }
];

// Helper to check if window is defined (browser environment)
const isBrowser = typeof window !== 'undefined';

// In-memory fallback
let localSchedules: Schedule[] = [];
let localBookings: Booking[] = [];
let localLogs: AuditLog[] = [];

// Seed baseline schedules
const seedSchedules = (): Schedule[] => {
  const list: Schedule[] = [];
  const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
  
  ROUTES.forEach(route => {
    OPERATORS.forEach(op => {
      hours.forEach((time, index) => {
        list.push({
          id: `sch-${op.code.toLowerCase()}-${route.id}-${index}`,
          operatorId: op.id,
          routeId: route.id,
          busNumber: `${op.code}-${Math.floor(100 + Math.random() * 900)}-26`,
          totalSeats: op.code === 'VIP' ? 49 : 44,
          reservedSeats: [],
          scheduledTime: time,
          estimatedDepartureTime: time,
          departureRatePerHour: op.code === 'VIP' ? 20 : 15, // standard filling threshold
          status: 'scheduled'
        });
      });
    });
  });
  return list;
};

// Seed baseline logs
const seedLogs = (): AuditLog[] => {
  return [
    {
      id: 'log-seed-1',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      actor: 'system',
      action: 'database_initialization',
      details: 'System bootstrapped with default VIP and STC profiles.',
      hash: '0000a1b2c3d4e5f6g7h8i9j0'
    }
  ];
};

export const getSchedules = (): Schedule[] => {
  if (!isBrowser) return seedSchedules();
  const data = localStorage.getItem('bus_schedules');
  if (data) {
    localSchedules = JSON.parse(data);
  } else {
    localSchedules = seedSchedules();
    localStorage.setItem('bus_schedules', JSON.stringify(localSchedules));
  }
  return localSchedules;
};

export const saveSchedules = (schedules: Schedule[]) => {
  localSchedules = schedules;
  if (isBrowser) {
    localStorage.setItem('bus_schedules', JSON.stringify(schedules));
  }
};

export const getBookings = (): Booking[] => {
  if (!isBrowser) return [];
  const data = localStorage.getItem('bus_bookings');
  if (data) {
    localBookings = JSON.parse(data);
  }
  return localBookings;
};

export const saveBookings = (bookings: Booking[]) => {
  localBookings = bookings;
  if (isBrowser) {
    localStorage.setItem('bus_bookings', JSON.stringify(bookings));
  }
};

export const getAuditLogs = (): AuditLog[] => {
  if (!isBrowser) return seedLogs();
  const data = localStorage.getItem('bus_audit_logs');
  if (data) {
    localLogs = JSON.parse(data);
  } else {
    localLogs = seedLogs();
    localStorage.setItem('bus_audit_logs', JSON.stringify(localLogs));
  }
  return localLogs;
};

export const addAuditLog = (actor: AuditLog['actor'], action: string, details: string) => {
  const logs = getAuditLogs();
  const lastHash = logs.length > 0 ? logs[logs.length - 1].hash : '000000000000000000000000';
  
  // Quick mock SHA-256 style linkage hash
  const combined = lastHash + actor + action + details + Date.now();
  let hashVal = 0;
  for (let i = 0; i < combined.length; i++) {
    hashVal = (hashVal << 5) - hashVal + combined.charCodeAt(i);
    hashVal |= 0;
  }
  const nextHash = Math.abs(hashVal).toString(16).padStart(24, '0');

  const newLog: AuditLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    details,
    hash: nextHash
  };

  logs.push(newLog);
  localLogs = logs;
  if (isBrowser) {
    localStorage.setItem('bus_audit_logs', JSON.stringify(logs));
  }
};
