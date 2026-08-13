/**
 * ============================================================================
 * layout.tsx — ROOT LAYOUT (the application shell)
 * ============================================================================
 *
 * Defines the HTML structure wrapping EVERY page in the application. In the
 * Next.js App Router, this file is the outermost component: each page is
 * rendered into the `children` slot below, which is why the header and footer
 * appear consistently across the commuter portal, operator dashboard, gate
 * scanner, regulator ledger and map without being repeated in each file.
 *
 * Structure:
 *   <html> -> <body> -> [ Header | page content | footer ]
 *
 * This is a Server Component (note the absence of a 'use client' directive):
 * it holds no interactive state, so Next.js renders it once on the server,
 * which is faster and reduces the JavaScript sent to the browser.
 */

import type { Metadata } from "next";
import Header from "@/components/Header";
import Logo from "@/components/Logo";
import "./globals.css"; // imported here so the global stylesheet applies to every page

/**
 * Page metadata, used by Next.js to populate the document <head>. Sets the
 * browser tab title and the description used by search engines and link
 * previews.
 */
export const metadata: Metadata = {
  title: "GhanaTBS - Online Intercity Bus Booking System",
  description: "Integrated bus booking and scheduling platform for Ghana",
};

export default function RootLayout({
  children, // the currently active page, injected by the Next.js router
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="en" aids screen readers and translation tools.
    // data-theme sets the initial colour scheme; Header.tsx updates this same
    // attribute at runtime when the user toggles dark mode, and the CSS
    // variables in globals.css respond to its value.
    <html lang="en" data-theme="light">
      <body>
        {/* Navigation bar, shared by every page. */}
        <Header />

        {/* Active page renders here. max-width keeps line lengths readable on
            wide monitors while remaining fluid on mobile; flex: 1 makes this
            region absorb spare vertical space so the footer stays at the
            bottom even on short pages. */}
        <main style={{ flex: 1, padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          {children}
        </main>

        {/* Footer carrying the academic-prototype declaration, shown on every
            page so the disclosure is never more than a glance away. */}
        <footer style={{
          borderTop: '1px solid var(--border-glass)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.85rem',
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* The same inline mark used in the header, set smaller and slightly
              faded so it identifies the page without competing with content. */}
          <Logo height={22} className="site-logo-footer" />
          <span>
            GhanaTBS Bus Booking System Prototype. Built for academic validation under Ghana Transport Modernisation Guidelines.
          </span>
        </footer>
      </body>
    </html>
  );
}
