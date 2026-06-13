import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccraTransit - Online Intercity Bus Booking System",
  description: "Integrated bus booking and scheduling platform for Ghana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(9, 9, 14, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-glass)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-gold) 0%, var(--primary) 100%)',
              color: '#09090e',
              padding: '6px 12px',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '1rem',
              letterSpacing: '0.05em'
            }}>
              AccraTransit
            </span>
          </Link>
          
          <nav style={{ display: 'flex', gap: '16px' }}>
            <Link href="/" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Commuter Portal
            </Link>
            <Link href="/operator" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Operator Dash
            </Link>
            <Link href="/gate" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Gate Scanner
            </Link>
            <Link href="/regulator" className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
              Regulator Audit
            </Link>
          </nav>
        </header>

        <main style={{ flex: 1, padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          {children}
        </main>
        
        <footer style={{
          borderTop: '1px solid var(--border-glass)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.85rem',
          marginTop: 'auto'
        }}>
          AccraTransit Bus Booking System Prototype. Built for academic validation under Ghana Transport Modernisation Guidelines.
        </footer>
      </body>
    </html>
  );
}
