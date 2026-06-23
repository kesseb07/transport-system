'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getBookings, getSchedules, ROUTES, OPERATORS, Booking, Schedule } from '../../services/database';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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

  const downloadImage = async (ticketId: string) => {
    const element = document.getElementById(`ticket-${ticketId}`);
    if (!element) return;
    
    const originalBg = element.style.background;
    element.style.background = '#09090e'; // Ensure dark theme bg matches
    
    try {
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#09090e' });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `${ticketId}.png`;
      link.click();
    } finally {
      element.style.background = originalBg;
    }
  };

  const downloadPDF = async (ticketId: string) => {
    const element = document.getElementById(`ticket-${ticketId}`);
    if (!element) return;
    
    const originalBg = element.style.background;
    element.style.background = '#09090e';
    
    try {
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#09090e' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a5');
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      const finalHeight = Math.min(pdfHeight, pdf.internal.pageSize.getHeight());
      const finalWidth = (finalHeight * imgProps.width) / imgProps.height;
      
      const xOffset = (pdf.internal.pageSize.getWidth() - finalWidth) / 2;
      
      pdf.addImage(imgData, 'PNG', xOffset, 10, finalWidth, finalHeight);
      pdf.save(`${ticketId}.pdf`);
    } finally {
      element.style.background = originalBg;
    }
  };

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

  const getRouteDetails = (routeId: string) => {
    return ROUTES.find(r => r.id === routeId) || { origin: 'Unknown', destination: 'Unknown' };
  };

  const getOperatorDetails = (operatorId: string) => {
    return OPERATORS.find(o => o.id === operatorId) || { name: 'Unknown', color: '#666' };
  };

  return (
    <section className="glass-panel" style={{ padding: '32px', maxWidth: '1000px', margin: '32px auto', textAlign: 'center', border: '1px solid var(--border-glass-active)' }}>
      <span className="badge badge-success" style={{ marginBottom: '16px' }}>
        Reservation Confirmed
      </span>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '20px' }}>Your Digital Tickets</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {tickets.map(ticket => {
          const route = getRouteDetails(schedule.routeId);
          const operator = getOperatorDetails(schedule.operatorId);
          return (
            <div key={ticket.id} id={`ticket-${ticket.id}`} className="glass-panel" style={{ padding: '24px', borderRadius: '12px', borderTop: `4px solid ${operator.color}`, textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px dashed var(--text-dim)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.3rem', color: 'var(--accent-gold)', margin: '0 0 4px 0', fontWeight: 800, letterSpacing: '1px' }}>BOARDING PASS</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Ticket ID: {ticket.id}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ background: operator.color, color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                    {operator.name}
                  </span>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>From</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{route.origin}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>To</p>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{route.destination}</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Passenger Name</p>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>{ticket.passengerName}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Seat Number</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{ticket.seatNumber}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Departure Time</p>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>{schedule.scheduledTime}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Bus No.</p>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'monospace' }}>{schedule.busNumber}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--btn-secondary-bg)', padding: '12px', borderRadius: '6px' }}>
                  <div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase' }}>Booked On</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{new Date(ticket.timestamp).toLocaleString()}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase' }}>Status</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--glow-green)', fontWeight: 700 }}>PAID ({ticket.momoProvider})</p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }} data-html2canvas-ignore="true">
                <button onClick={() => downloadImage(ticket.id)} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}>
                  Save PNG
                </button>
                <button onClick={() => downloadPDF(ticket.id)} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}>
                  Save PDF
                </button>
              </div>
            </div>
          );
        })}
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
