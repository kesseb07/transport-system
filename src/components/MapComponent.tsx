'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default leaflet marker icon issue in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Bus Icon using emoji or simple div to avoid external image dependencies
const busIcon = new L.DivIcon({
  html: `<div style="background-color: var(--primary); color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; justify-content: center; align-items: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); font-size: 14px;">🚌</div>`,
  className: 'bus-marker-icon',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// City Coordinates (Ghana)
const CITIES = {
  Accra: [5.6037, -0.1870],
  Kumasi: [6.6885, -1.6244],
  Takoradi: [4.8933, -1.7588],
  Tamale: [9.4008, -0.8393],
  Ho: [6.6119, 0.4703],
  Sunyani: [7.3349, -2.3123],
  CapeCoast: [5.1053, -1.2466]
} as const;

// Routes defined as tuples of coordinates
const ROUTES = [
  { id: 'acc-kum', name: 'Accra to Kumasi', path: [CITIES.Accra, CITIES.Kumasi], color: '#3b82f6' },
  { id: 'acc-tak', name: 'Accra to Takoradi', path: [CITIES.Accra, CITIES.CapeCoast, CITIES.Takoradi], color: '#10b981' },
  { id: 'acc-ho', name: 'Accra to Ho', path: [CITIES.Accra, CITIES.Ho], color: '#f59e0b' },
  { id: 'kum-tam', name: 'Kumasi to Tamale', path: [CITIES.Kumasi, CITIES.Tamale], color: '#8b5cf6' },
  { id: 'kum-sun', name: 'Kumasi to Sunyani', path: [CITIES.Kumasi, CITIES.Sunyani], color: '#ec4899' },
];

// Helper to interpolate position
function getPointAlongLine(start: number[], end: number[], progress: number) {
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress
  ];
}

// Generate initial buses
function generateInitialBuses() {
  const buses = [];
  const operators = ['VIP Jeoun', 'STC', 'O.A Travel', 'VVIP', 'Metro Mass'];
  
  for (let i = 0; i < 25; i++) {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    buses.push({
      id: `bus-${i}`,
      routeId: route.id,
      operator: operators[Math.floor(Math.random() * operators.length)],
      routeDetails: route,
      progress: Math.random(), // 0 to 1
      speed: 0.0005 + Math.random() * 0.0015, // Progress per tick
      direction: Math.random() > 0.5 ? 1 : -1, // 1 for forward, -1 for backward
    });
  }
  return buses;
}

export default function MapComponent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [buses, setBuses] = useState<any[]>([]);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // Check initial theme to set map tiles
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(currentTheme);

    // Watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          setTheme(document.documentElement.getAttribute('data-theme') || 'light');
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });

    // Initialize buses
    setBuses(generateInitialBuses());

    // Simulation loop for smooth movement
    const interval = setInterval(() => {
      setBuses(prev => prev.map(bus => {
        let newProgress = bus.progress + (bus.speed * bus.direction);
        let newDirection = bus.direction;
        
        if (newProgress >= 1) {
          newProgress = 1;
          newDirection = -1; // Turn around
        } else if (newProgress <= 0) {
          newProgress = 0;
          newDirection = 1; // Turn around
        }
        
        return { ...bus, progress: newProgress, direction: newDirection };
      }));
    }, 100);

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  const getBusPosition = (bus: any) => {
    const path = bus.routeDetails.path;
    const totalSegments = path.length - 1;
    const scaledProgress = bus.progress * totalSegments;
    const segmentIndex = Math.min(Math.floor(scaledProgress), totalSegments - 1);
    const segmentProgress = scaledProgress - segmentIndex;
    
    return getPointAlongLine(path[segmentIndex], path[segmentIndex + 1], segmentProgress);
  };

  // CartoDB tiles provide clean, professional base maps without heavy labels
  const tileUrl = theme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50px',
        zIndex: 1000,
        background: 'var(--bg-card)',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        border: '1px solid var(--border-glass)',
        backdropFilter: 'blur(10px)',
        color: 'var(--text-main)'
      }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 800 }}>Live Fleet Tracker</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--glow-green)' }}>●</span> {buses.length} Active Vehicles (Simulated)<br/>
          <span style={{ opacity: 0.7 }}>Perpetual Object Manifest</span>
        </p>
      </div>

      <MapContainer 
        center={[7.95, -1.2]} 
        zoom={7} 
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={false}
      >
        <TileLayer
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {ROUTES.map(route => (
          <Polyline 
            key={route.id}
            positions={route.path as any}
            pathOptions={{ color: route.color, weight: 3, opacity: 0.6, dashArray: '5, 10' }}
          />
        ))}

        {buses.map(bus => {
          const position = getBusPosition(bus);
          return (
            <Marker 
              key={bus.id} 
              position={position as any}
              icon={busIcon}
            >
              <Popup>
                <div style={{ textAlign: 'center', color: '#333' }}>
                  <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '1rem' }}>{bus.operator}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>Route: {bus.routeDetails.name}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem' }}>Status: {bus.direction === 1 ? 'Outbound' : 'Inbound'}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
