'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
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
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', zIndex: 101 }}>
        <span style={{
          background: 'linear-gradient(135deg, var(--accent-gold) 0%, var(--primary) 100%)',
          color: '#09090e',
          padding: '6px 12px',
          borderRadius: '8px',
          fontWeight: 800,
          fontSize: '1rem',
          letterSpacing: '0.05em'
        }}>
          GhanaTBS
        </span>
      </Link>
      
      <button 
        className="hamburger-btn" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', zIndex: 101 }}
        aria-label="Toggle menu"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      <nav className={`desktop-nav ${isOpen ? 'mobile-nav-open' : 'mobile-nav-closed'}`}>
        <Link href="/" className="btn-secondary" onClick={() => setIsOpen(false)} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Commuter Portal
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
