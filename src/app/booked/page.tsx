'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getBookings, getSchedules, Booking, Schedule } from '../../services/database';

function TicketContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticketIds = searchParams.get('tickets')?.split(',') || [];
  
  const [tickets, setTickets] = useState<Booking[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (ticketIds.length === 0) {
        setIsLoading(false);
        return;
      }
      const allBookings = await getBookings();
      const myTickets = allBookings.filter(b => ticketIds.includes(b.id));
      setTickets(myTickets);
      
      if (myTickets.length > 0) {
        const allSchedules = await getSchedules();
        const mySchedule = allSchedules.find(s => s.id === myTickets[0].scheduleId);
        if (mySchedule) setSchedule(mySchedule);
      }
      setIsLoading(false);
    }
    loadData();
  }, [searchParams]);

  if (isLoading) {
    return <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading your tickets...</div>;
  }

  if (tickets.length === 0 || !schedule) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#ef4444' }}>Tickets Not Found</h2>
        <p style={{ marginBottom: '24px' }}>We couldn't find the tickets you're looking for.</p>
        <button onClick={() => router.push('/')} className="btn-primary">Return to Booking</button>
      </div>
    );
  }

  return (
    <section className="glass-panel" style={{ padding: '32px', maxWidth: '1000px', margin: '32px auto', textAlign: 'center', border: '1px solid var(--border-glass-active)' }}>
      <span className="badge badge-success" style={{ marginBottom: '16px' }}>
        Reservation Confirmed
      </span>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '20px' }}>Your Digital Tickets</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {tickets.map(ticket => (
          <div key={ticket.id} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)', textAlign: 'left' }}>
            <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ border: '2px dashed #000', padding: '8px', background: '#fff' }}>
                <div style={{ width: '120px', height: '120px', background: '#000', margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#fff', padding: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', width: '100%', height: '100%' }}>
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
                <p style={{ color: '#000', fontSize: '0.55rem', fontFamily: 'monospace', marginTop: '8px', wordBreak: 'break-all' }}>
                  SIG: {JSON.parse(ticket.qrPayload).signature}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)' }}>Ticket ID:</span> {ticket.id}</p>
              <p style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)' }}>Passenger:</span> {ticket.passengerName}</p>
              <p style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)' }}>Bus:</span> {schedule.busNumber}</p>
              <p style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)' }}>Seat:</span> {ticket.seatNumber}</p>
              <p style={{ fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)' }}>Time:</span> {schedule.scheduledTime}</p>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => router.push('/')} className="btn-secondary" style={{ width: '100%', maxWidth: '300px' }}>
        Book Another Journey
      </button>
    </section>
  );
}

export default function BookedPage() {
  return (
    <Suspense fallback={<div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <TicketContent />
    </Suspense>
  );
}
