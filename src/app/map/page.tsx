/**
 * ============================================================================
 * map/page.tsx — LIVE MAP PAGE (route: /map)
 * ============================================================================
 *
 * A thin wrapper that hosts the fleet tracking map. All the mapping logic
 * lives in components/MapComponent.tsx; this file exists only to give that
 * component a URL and a full-height container.
 *
 * WHY THE MAP IS LOADED THIS WAY
 * ------------------------------
 * Next.js pre-renders pages on the server by default. Leaflet cannot survive
 * that: it manipulates the DOM directly and expects `window` to exist, so
 * server-side rendering throws "window is not defined" and the build fails.
 *
 * next/dynamic with `ssr: false` solves this by excluding the component from
 * server rendering entirely and loading it only once the page reaches the
 * browser. This is the standard pattern for integrating browser-only libraries
 * into Next.js.
 *
 * A side benefit is code splitting: the Leaflet bundle is downloaded only by
 * visitors who open this page, keeping the booking pages light — which matters
 * for the low-bandwidth mobile connections this project targets.
 */

'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false, // never render on the server; Leaflet requires a real browser DOM
  // Spinner shown while the map bundle downloads.

  loading: () => (
    <div style={{ height: 'calc(100vh - 80px)', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        width: '50px',
        height: '50px',
        border: '4px solid var(--border-glass)',
        borderTopColor: 'var(--primary)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
});

export default function MapPage() {
  return (
    // Fills the viewport minus the site header (75px), so the map occupies all
    // remaining space without introducing a page scrollbar.
    <div style={{ width: '100%', height: 'calc(100vh - 75px)', position: 'relative' }}>
      <MapComponent />
    </div>
  );
}
