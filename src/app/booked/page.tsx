'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getBookings, getSchedules, Booking, Schedule } from '../../services/database';
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

  return (
    <section className="glass-panel" style={{ padding: '32px', maxWidth: '1000px', margin: '32px auto', textAlign: 'center', border: '1px solid var(--border-glass-active)' }}>
      <span className="badge badge-success" style={{ marginBottom: '16px' }}>
        Reservation Confirmed
      </span>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '20px' }}>Your Digital Tickets</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {tickets.map(ticket => (
          <div key={ticket.id} id={`ticket-${ticket.id}`} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-glass)', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
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
                <p style={{ color: '#000', fontSize: '0.55rem', fontFamily: 'monospace', marginTop: '8px', wordBreak: 'break-all', textAlign: 'center' }}>
                  SIG: {JSON.parse(ticket.qrPayload).signature}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', flex: 1 }}>
              <p style={{ fontSize: '0.9rem' }}><strong style={{ color: 'var(--text-muted)' }}>Ticket ID:</strong> {ticket.id}</p>
              <p style={{ fontSize: '0.9rem' }}><strong style={{ color: 'var(--text-muted)' }}>Passenger:</strong> {ticket.passengerName}</p>
              <p style={{ fontSize: '0.9rem' }}><strong style={{ color: 'var(--text-muted)' }}>Bus:</strong> {schedule.busNumber}</p>
              <p style={{ fontSize: '0.9rem' }}><strong style={{ color: 'var(--text-muted)' }}>Seat:</strong> {ticket.seatNumber}</p>
              <p style={{ fontSize: '0.9rem' }}><strong style={{ color: 'var(--text-muted)' }}>Time:</strong> {schedule.scheduledTime}</p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }} data-html2canvas-ignore="true">
              <button onClick={() => downloadImage(ticket.id)} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}>
                Save PNG
              </button>
              <button onClick={() => downloadPDF(ticket.id)} className="btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)' }}>
                Save PDF
              </button>
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
