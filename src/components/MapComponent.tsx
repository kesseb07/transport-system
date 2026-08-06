/**
 * ============================================================================
 * MapComponent.tsx — LIVE FLEET TRACKING MAP
 * ============================================================================
 *
 * Renders an interactive map of Ghana with buses moving along the intercity
 * corridors, built with Leaflet (an open-source mapping library) via its React
 * bindings.
 *
 * PURPOSE: gives passengers and operators a spatial view of the network to
 * complement the tabular schedule data — where the fleet is, not merely when
 * it is due. It demonstrates how live GPS telemetry would be presented once
 * vehicles are instrumented.
 *
 * IMPORTANT — THIS DATA IS SIMULATED
 * ----------------------------------
 * The 25 buses shown are generated locally and move along interpolated
 * straight lines between cities. They are NOT connected to the booking
 * database, and no real vehicle positions are involved: the modelled fleet has
 * no GPS hardware to report from. This component therefore demonstrates the
 * VISUALISATION layer that real telemetry would feed, and should be understood
 * as an interface prototype rather than a tracking result. The on-screen label
 * marks the vehicle count as "(Simulated)" so viewers are not misled.
 *
 * A production version would replace generateInitialBuses() and the animation
 * loop with a subscription to real position updates; the rendering below would
 * be largely unchanged.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet resolves its default marker images using relative paths that assume
// a traditional web server layout. Next.js bundles assets differently, so the
// icons 404 and markers render blank. The standard workaround is to delete the
// internal URL resolver and point Leaflet at absolute CDN URLs instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * Bus marker rendered as an HTML element containing an emoji, rather than a
 * bitmap image. This keeps the marker crisp at any zoom level, avoids shipping
 * an image asset, and lets it inherit the application's theme colour.
 */
const busIcon = new L.DivIcon({
  html: `<div style="background-color: var(--primary); color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; justify-content: center; align-items: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); font-size: 14px;">🚌</div>`,
  className: 'bus-marker-icon',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/**
 * Real latitude/longitude coordinates of the terminal cities, matching the
 * nodes of the transit graph in services/algorithms.ts. Stored as
 * [latitude, longitude], the order Leaflet expects.
 *
 * `as const` makes the object deeply readonly, so TypeScript treats each entry
 * as a fixed pair of numbers rather than a mutable array.
 */
const CITIES = {
  Accra: [5.6037, -0.1870],
  Kumasi: [6.6885, -1.6244],
  Takoradi: [4.8933, -1.7588],
  Tamale: [9.4008, -0.8393],
  Ho: [6.6119, 0.4703],
  Sunyani: [7.3349, -2.3123],
  CapeCoast: [5.1053, -1.2466]
} as const;

/**
 * Corridors drawn on the map, each a sequence of coordinates forming a line.
 *
 * The Accra-Takoradi corridor passes through Cape Coast, mirroring the
 * multi-hop path Dijkstra's algorithm computes for that journey.
 *
 * NOTE: these are straight lines between city centres, not the actual road
 * geometry, which would require route data from a mapping service. Distances
 * on screen are therefore indicative rather than precise.
 *
 * This constant shares its name with the ROUTES export in services/database.ts
 * but is a separate, map-specific structure — it holds drawing coordinates and
 * colours, not fares.
 */
const ROUTES = [
  { id: 'acc-kum', name: 'Accra to Kumasi', path: [CITIES.Accra, CITIES.Kumasi], color: '#3b82f6' },
  { id: 'acc-tak', name: 'Accra to Takoradi', path: [CITIES.Accra, CITIES.CapeCoast, CITIES.Takoradi], color: '#10b981' },
  { id: 'acc-ho', name: 'Accra to Ho', path: [CITIES.Accra, CITIES.Ho], color: '#f59e0b' },
  { id: 'kum-tam', name: 'Kumasi to Tamale', path: [CITIES.Kumasi, CITIES.Tamale], color: '#8b5cf6' },
  { id: 'kum-sun', name: 'Kumasi to Sunyani', path: [CITIES.Kumasi, CITIES.Sunyani], color: '#ec4899' },
];

/**
 * LINEAR INTERPOLATION between two coordinates.
 *
 * Given a start point, an end point and a progress value from 0 to 1, returns
 * the point that fraction of the way along the line:
 *
 *     position = start + (end - start) x progress
 *
 * With progress 0 the result is the start, 1 the end, and 0.5 the midpoint.
 * Applied to latitude and longitude independently, this is what makes the bus
 * markers glide smoothly rather than jumping between cities.
 */
function getPointAlongLine(start: number[], end: number[], progress: number) {
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress
  ];
}

/**
 * Creates the simulated fleet.
 *
 * 25 buses are distributed randomly across the corridors, each with a random
 * starting position, speed and direction. The randomisation matters visually:
 * identical buses would move in lockstep and look obviously artificial,
 * whereas varied speeds and offsets resemble genuine independent traffic.
 *
 * The operator list here is broader than the two companies modelled elsewhere
 * in the system, reflecting the fuller set of carriers on Ghanaian roads.
 */
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
      // Position along the corridor as a fraction (0 = start, 1 = end).
      // Randomised so buses begin scattered rather than bunched at terminals.
      progress: Math.random(),
      // Distance advanced per animation frame. The small magnitude produces
      // realistically slow movement at the 100ms tick rate used below.
      speed: 0.0005 + Math.random() * 0.0015,
      // Travel direction: 1 outbound, -1 inbound. Roughly half start each way,
      // so traffic flows both directions as on a real corridor.
      direction: Math.random() > 0.5 ? 1 : -1,
    });
  }
  return buses;
}

export default function MapComponent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [buses, setBuses] = useState<any[]>([]);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // --- Match the map tiles to the application's light/dark theme ---
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(currentTheme);

    // The theme is toggled elsewhere (in Header.tsx) by setting a data-theme
    // attribute on the <html> element. A MutationObserver watches that
    // attribute so the map can swap its tiles in response — this component has
    // no direct connection to the header, so it observes the DOM instead.
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          setTheme(document.documentElement.getAttribute('data-theme') || 'light');
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });

    // Populate the simulated fleet.
    setBuses(generateInitialBuses());

    // --- ANIMATION LOOP ---
    // Every 100ms (10 frames per second) each bus advances along its corridor.
    // This rate is a deliberate compromise: fast enough to look continuous,
    // slow enough to stay smooth on the low-powered mobile devices typical of
    // the target users.
    const interval = setInterval(() => {
      setBuses(prev => prev.map(bus => {
        // Advance by speed, signed by direction of travel.
        let newProgress = bus.progress + (bus.speed * bus.direction);
        let newDirection = bus.direction;

        // On reaching either end of the corridor, reverse direction. This gives
        // each bus a perpetual out-and-back shuttle, so the map never empties.
        if (newProgress >= 1) {
          newProgress = 1;
          newDirection = -1;
        } else if (newProgress <= 0) {
          newProgress = 0;
          newDirection = 1;
        }

        // Return a NEW object rather than mutating: React detects state changes
        // by reference, so an in-place edit would not trigger a re-render.
        return { ...bus, progress: newProgress, direction: newDirection };
      }));
    }, 100);

    // Cleanup, run when the user navigates away. Without this the timer and
    // observer would keep running after the map is removed — a memory leak.
    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  /**
   * Converts a bus's overall progress (0..1 across its whole corridor) into
   * actual map coordinates.
   *
   * Corridors may consist of several segments — Accra->Takoradi is drawn as
   * Accra->Cape Coast->Takoradi, giving two. The overall progress must
   * therefore be resolved to a position WITHIN the correct segment:
   *
   *   1. Scale progress by the segment count (0.75 over 2 segments -> 1.5).
   *   2. The integer part identifies the segment (1 = the second segment).
   *   3. The fractional part is the progress within it (0.5 = halfway).
   *   4. Interpolate between that segment's two endpoints.
   *
   * Math.min() caps the index so that progress of exactly 1.0 stays within the
   * final segment rather than indexing past the end of the array.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      {/* The map itself. Centre and zoom are chosen to frame Ghana as a whole;
          [7.95, -1.2] sits roughly at the country's geographic centre. */}
      <MapContainer
        center={[7.95, -1.2]}
        zoom={7}
        style={{ height: '100%', width: '100%', zIndex: 1 }}
        zoomControl={false}
      >
        {/* Base map imagery. The attribution is a licensing requirement of
            OpenStreetMap and CARTO, not decoration — it must remain visible. */}
        <TileLayer
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* Corridor lines, one per route, drawn dashed to signal that they are
            indicative connections rather than surveyed road geometry. */}
        {ROUTES.map(route => (
          <Polyline
            key={route.id}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            positions={route.path as any}
            pathOptions={{ color: route.color, weight: 3, opacity: 0.6, dashArray: '5, 10' }}
          />
        ))}

        {/* One marker per bus, repositioned on every animation tick. Clicking a
            marker opens a popup with that vehicle's operator and direction. */}
        {buses.map(bus => {
          const position = getBusPosition(bus);
          return (
            <Marker
              key={bus.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
