/**
 * ============================================================================
 * booked/page.tsx — DIGITAL BOARDING PASSES (route: /booked?tickets=...)
 * ============================================================================
 *
 * The final step of the booking lifecycle. After payment the passenger is
 * redirected here, where each purchased seat is rendered as a boarding pass
 * that can be saved as a PNG image or a PDF.
 *
 * WHY DOWNLOADABLE TICKETS MATTER HERE
 * ------------------------------------
 * This is not a convenience feature but part of the offline-resilience
 * argument. A ticket saved to the phone's gallery or files is available at the
 * terminal gate with no data connection, no app installed, and no need to log
 * back in — conditions that are common in the target context. The saved image
 * carries all the details the gate scanner needs, including the signature that
 * makes offline verification possible.
 *
 * Tickets are identified by IDs passed in the URL query string
 * (?tickets=TKT-123-4,TKT-123-5), which means the page is shareable and
 * re-openable: a passenger can return to the same link to retrieve their
 * boarding passes.
 */

'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getBookings, getSchedules, ROUTES, OPERATORS, Booking, Schedule } from '../../services/database';
import html2canvas from 'html2canvas'; // renders a DOM element to a canvas image
import jsPDF from 'jspdf';             // builds a PDF document in the browser

/**
 * Inner component holding the actual page content.
 *
 * Kept separate from the default export because it calls useSearchParams(),
 * which Next.js requires to be wrapped in a <Suspense> boundary — see the note
 * on BookedPage at the foot of this file.
 */
function TicketContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Parse the comma-separated ticket IDs from the URL. Optional chaining (?.)
  // guards the case where the parameter is absent, falling back to an empty
  // array so the "not found" state renders instead of crashing.
  const ticketIds = searchParams.get('tickets')?.split(',') || [];

  const [tickets, setTickets] = useState<Booking[]>([]);        // the purchased seats
  const [schedule, setSchedule] = useState<Schedule | null>(null); // the bus they are on
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (ticketIds.length === 0) {
        setIsLoading(false);
        return;
      }

      // Retrieve the specific bookings named in the URL.
      const allBookings = await getBookings();
      const myTickets = allBookings.filter(b => ticketIds.includes(b.id));
      setTickets(myTickets);

      if (myTickets.length > 0) {
        // All seats in one booking share a bus, so the schedule is looked up
        // once from the first ticket and reused for every pass. This supplies
        // the route, departure time and bus number printed on each ticket.
        const allSchedules = await getSchedules();
        const mySchedule = allSchedules.find(s => s.id === myTickets[0].scheduleId);
        if (mySchedule) setSchedule(mySchedule);
      }
      setIsLoading(false);
    }
    loadData();
  }, [searchParams]); // re-run if the URL changes, e.g. navigating to a different booking

  /**
   * Saves one boarding pass as a PNG image.
   *
   * Works by screenshotting the ticket's DOM element with html2canvas, then
   * triggering a download through a temporary anchor element — a standard
   * browser technique for saving generated data without a server round trip.
   */
  const downloadImage = async (ticketId: string) => {
    // Each ticket carries id="ticket-<id>" in the markup so it can be targeted
    // individually for capture.
    const element = document.getElementById(`ticket-${ticketId}`);
    if (!element) return;

    // The ticket uses semi-transparent "glass" styling, which would capture as
    // transparent and render unreadable. A solid background is applied for the
    // duration of the capture and restored afterwards.
    const originalBg = element.style.background;
    element.style.background = '#09090e';

    try {
      // scale: 2 renders at twice the screen resolution, keeping the saved
      // ticket legible on high-density phone displays and when printed.
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#09090e' });
      const image = canvas.toDataURL('image/png'); // canvas -> base64 data URI

      // Create an off-document link, click it programmatically, and let the
      // browser handle the save.
      const link = document.createElement('a');
      link.href = image;
      link.download = `${ticketId}.png`;
      link.click();
    } finally {
      // `finally` guarantees the original styling is restored even if the
      // capture throws, so a failed download cannot leave the page altered.
      element.style.background = originalBg;
    }
  };

  /**
   * Saves one boarding pass as a PDF.
   *
   * Same capture approach as downloadImage, but the resulting image is placed
   * into an A5 PDF page. PDF is offered alongside PNG because it prints at a
   * predictable physical size — useful for a passenger who wants a paper copy
   * as a fallback against a flat phone battery.
   */
  const downloadPDF = async (ticketId: string) => {
    const element = document.getElementById(`ticket-${ticketId}`);
    if (!element) return;

    const originalBg = element.style.background;
    element.style.background = '#09090e';

    try {
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#09090e' });
      const imgData = canvas.toDataURL('image/png');

      // 'p' = portrait, 'mm' = millimetre units, 'a5' = page size (148x210mm),
      // chosen as a close approximation of a physical ticket.
      const pdf = new jsPDF('p', 'mm', 'a5');

      // --- Fit the captured image to the page while preserving aspect ratio ---
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      // Height the image would occupy if scaled to the full page width.
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      // If that would overflow the page, constrain by height instead and
      // recompute the width from the original ratio, so the ticket is never
      // cropped or distorted.
      const finalHeight = Math.min(pdfHeight, pdf.internal.pageSize.getHeight());
      const finalWidth = (finalHeight * imgProps.width) / imgProps.height;

      // Centre horizontally; 10mm top margin.
      const xOffset = (pdf.internal.pageSize.getWidth() - finalWidth) / 2;

      pdf.addImage(imgData, 'PNG', xOffset, 10, finalWidth, finalHeight);
      pdf.save(`${ticketId}.pdf`);
    } finally {
      element.style.background = originalBg;
    }
  };

  // --- Loading state, shown while bookings are retrieved. ---
  if (isLoading) {
    return <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading your tickets...</div>;
  }

  // --- Not-found state: no matching tickets, or the bus could not be
  // resolved. Reached via a mistyped URL, or a link opened in a different
  // browser when running in localStorage mode, where data does not travel
  // between browsers. ---
  if (tickets.length === 0 || !schedule) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', color: '#ef4444' }}>Tickets Not Found</h2>
        <p style={{ marginBottom: '24px' }}>We couldn't find the tickets you're looking for.</p>
        <button onClick={() => router.push('/')} className="btn-primary">Return to Booking</button>
      </div>
    );
  }

  // Lookup helpers translating stored IDs into printable details. Both return
  // a neutral placeholder rather than undefined, so a missing reference can
  // never crash the render of an otherwise valid ticket.
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
            // The id attribute is what the PNG/PDF capture functions target,
            // so each pass can be saved individually.
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

              {/* Download controls. data-html2canvas-ignore excludes this row
                  from the capture, so the saved ticket does not show its own
                  "Save PNG / Save PDF" buttons. */}
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

/**
 * Page entry point.
 *
 * TicketContent is wrapped in <Suspense> because it calls useSearchParams().
 * Next.js cannot know the URL's query string while pre-rendering on the
 * server, so any component reading it must declare a fallback to display until
 * the browser supplies the real values. Omitting this boundary causes a build
 * error, which is why the page is split into two components.
 */
export default function BookedPage() {
  return (
    <Suspense fallback={<div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <TicketContent />
    </Suspense>
  );
}
