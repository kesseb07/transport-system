'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
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
    <div style={{ width: '100%', height: 'calc(100vh - 75px)', position: 'relative' }}>
      <MapComponent />
    </div>
  );
}
