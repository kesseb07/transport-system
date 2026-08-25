# AccraTransit: Integrated Online Bus Booking System for Ghana

## 1. Project Overview
AccraTransit is an academic research prototype designed to modernize intercity public transport in Ghana, with an initial focus on major operators VIP Jeoun and the State Transport Corporation. The application addresses critical terminal inefficiencies—specifically localized congestion at dense hubs like Circle, physical ticketing counter queuing, and manual auditing revenue leakages—by digitizing the entire ticketing lifecycle.

## 2. Technical Stack
The system is built as a lightweight, mobile-first web application:
- Frontend Framework: Next.js with React and TypeScript.
- Styles: Vanilla CSS with custom properties and a dual light/dark theme, optimised for low-bandwidth mobile browsers. Light mode measures a 7.1:1 contrast ratio for primary text.
- Real-Time Database: Supabase integration for WebSocket-backed seat allocation updates. Replication keeps sessions in sync but does not serialise conflicting writes, and the reservation path has a known concurrency defect described in the evaluative essay.
- Local First Backup: A Dockerized PostgreSQL database fallback is configured to bypass cloud data residency concerns for ethics compliance.

## 3. Algorithmic Solutions
The project incorporates three core algorithms to resolve socio-technical constraints:

First, the Dynamic Rate Leaky Bucket Algorithm acts as the dispatcher control layer. Since Ghanaian bus operators rely on an informal fill-and-go departure model rather than fixed European timetables, this algorithm processes real-time booking accumulation velocity to generate simulated departures dynamically, pacing fleet dispatches to prevent physical terminal bottlenecks.

Second, Dijkstra's Shortest Path Algorithm operates on a graph representing the main transit nodes in Ghana (Accra, Kumasi, Tamale, Takoradi, Sunyani, Ho), optimizing route recommendations and providing commuters with accurate distance and travel duration estimates.

Third, the Offline QR Ticket Authentication System addresses the frequent cellular network dropouts at crowded terminals. Each ticket carries its fields together with an HMAC-SHA256 tag computed over them with a shared secret. The gate scanner recomputes the expected tag from the scanned fields and compares, so a boarding check needs no cloud lookup. SHA-256 and the HMAC construction are implemented from first principles in src/services/algorithms.ts and validated against Node's native crypto library. The shared key ships in client-side JavaScript, which is a known limitation of a browser-only prototype and is documented in the source.

## 4. Setup and Local Execution
To execute this project locally without Google Drive file locking EPERM issues, copy the project folder to your local drive and follow these commands:

1. Install dependencies: npm install
2. Start the development server: npm run dev
3. Open the browser: http://localhost:3000

The commuter interface is served at the root URL. The operator dashboard is served at /operator, the gate scanner simulator at /gate, and the regulator compliance audit ledger at /regulator.

## 5. Evaluation

An automated evaluation harness reproduces every empirical figure quoted in the evaluative essay:

```
npm run evaluate
```

It compiles `src/services` with the project's own TypeScript compiler and runs five procedures:
route correctness against an independently written Floyd-Warshall reference plus latency
benchmarking, dispatch model response across a booking-velocity sweep, ticket integrity under
tampering and forgery, concurrency behaviour of the seat reservation write path, and degradation
with the cloud database removed.

Results are written to `evaluation/results/results.json` and `evaluation/results/report.md`.

The harness reports failures as well as successes. The concurrency procedure records a defect in
the reservation write path rather than a pass.
