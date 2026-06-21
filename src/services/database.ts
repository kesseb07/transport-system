import { supabase } from './supabaseClient';

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
  departureRatePerHour: number;
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
  qrPayload: string;
  isValidated: boolean;
  validatedAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: 'passenger' | 'operator' | 'regulator' | 'system';
  action: string;
  details: string;
  hash: string;
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

const isBrowser = typeof window !== 'undefined';

const seedLocalSchedules = (): Schedule[] => {
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
          departureRatePerHour: op.code === 'VIP' ? 20 : 15,
          status: 'scheduled'
        });
      });
    });
  });
  return list;
};

export const getSchedules = async (): Promise<Schedule[]> => {
  if (supabase) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .order('scheduled_time', { ascending: true });
    
    if (!error && data && data.length > 0) {
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

    if (!error && data && data.length === 0) {
      // Auto-seed Supabase since the table is empty
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

  if (!isBrowser) return seedLocalSchedules();
  const cached = localStorage.getItem('bus_schedules');
  if (cached) return JSON.parse(cached);
  
  const initial = seedLocalSchedules();
  localStorage.setItem('bus_schedules', JSON.stringify(initial));
  return initial;
};

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
    if (!error) return;
  }

  if (isBrowser) {
    const cached = localStorage.getItem('bus_schedules');
    if (cached) {
      const list: Schedule[] = JSON.parse(cached);
      const updated = list.map(s => s.id === schedule.id ? schedule : s);
      localStorage.setItem('bus_schedules', JSON.stringify(updated));
    }
  }
};

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
        amountPaid: Number(item.amount_paid),
        timestamp: item.timestamp || new Date().toISOString(),
        qrPayload: item.qr_payload,
        isValidated: !!item.is_validated,
        validatedAt: item.validated_at || undefined
      }));
    }
  }

  if (!isBrowser) return [];
  const cached = localStorage.getItem('bus_bookings');
  return cached ? JSON.parse(cached) : [];
};

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

export const addAuditLog = async (actor: AuditLog['actor'], action: string, details: string): Promise<void> => {
  const logs = await getAuditLogs();
  const lastHash = logs.length > 0 ? logs[logs.length - 1].hash : '000000000000000000000000';
  
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
    logs.push(newLog);
    localStorage.setItem('bus_audit_logs', JSON.stringify(logs));
  }
};
