import type { Metadata } from "next";
import Header from "@/components/Header";
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
        <Header />

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
