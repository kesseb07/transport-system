/**
 * ============================================================================
 * Header.tsx — SITE NAVIGATION BAR
 * ============================================================================
 *
 * Persistent navigation shown on every page, rendered from layout.tsx.
 *
 * Its links double as a map of the system's four stakeholder views, which is
 * useful during a demonstration: an examiner can move directly between the
 * passenger, operator, gate and regulator perspectives on the same live data.
 *
 *   /          Commuter Portal  — passenger booking (Dijkstra + seat selection)
 *   /map       Live Map         — simulated fleet tracking
 *   /operator  Operator Dash    — dispatch control (leaky bucket algorithm)
 *   /gate      Gate Scanner     — offline ticket verification
 *   /regulator Regulator Audit  — compliance ledger and hash chain
 *
 * It also provides the light/dark theme toggle and the mobile navigation menu.
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);   // mobile menu open/closed
  const [theme, setTheme] = useState('light');   // active colour scheme

  /**
   * Applies the theme by writing a data-theme attribute onto the <html>
   * element. The CSS in globals.css defines a different set of colour
   * variables for each value, so this single attribute re-themes the entire
   * application at once — no component needs to know about the theme.
   *
   * MapComponent.tsx watches this same attribute with a MutationObserver in
   * order to swap its map tiles to match.
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]); // re-runs whenever the theme changes

  const toggleTheme = () => {
    // Uses the updater form (prev => ...) rather than reading `theme`
    // directly, which is the safe way to derive new state from old.
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    // position: sticky keeps the navigation visible while the page scrolls,
    // so the stakeholder views remain one click apart at all times.
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'var(--header-bg)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-glass)',
      padding: '16px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', zIndex: 101 }}>
        <span style={{
          background: 'var(--primary)',
          color: '#ffffff',
          padding: '6px 12px',
          borderRadius: '8px',
          fontWeight: 800,
          fontSize: '1rem',
          letterSpacing: '0.05em'
        }}>
          GhanaTBS
        </span>
      </Link>
      
      {/* Hamburger menu button. Hidden on desktop and revealed below 768px by
          the .hamburger-btn rules in globals.css — a mobile-first concession,
          since most users in the target context browse on a phone. */}
      <button
        className="hamburger-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1.5rem', cursor: 'pointer', zIndex: 101 }}
        aria-label="Toggle menu"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Navigation links. On desktop this is a horizontal row; on mobile the
          same markup becomes a full-screen overlay, shown or hidden by the
          conditional class. Each link closes the mobile menu on selection.
          Next.js <Link> performs client-side navigation, so switching between
          stakeholder views is instant and does not reload the page. */}
      <nav className={`desktop-nav ${isOpen ? 'mobile-nav-open' : 'mobile-nav-closed'}`}>
        <button onClick={toggleTheme} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem', marginRight: 'auto' }}>
          {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
        <Link href="/" className="btn-secondary" onClick={() => setIsOpen(false)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Commuter Portal
        </Link>
        <Link href="/map" className="btn-secondary" onClick={() => setIsOpen(false)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Live Map
        </Link>
        <Link href="/operator" className="btn-secondary" onClick={() => setIsOpen(false)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Operator Dash
        </Link>
        <Link href="/gate" className="btn-secondary" onClick={() => setIsOpen(false)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Gate Scanner
        </Link>
        <Link href="/regulator" className="btn-secondary" onClick={() => setIsOpen(false)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Regulator Audit
        </Link>
      </nav>
    </header>
  );
}
