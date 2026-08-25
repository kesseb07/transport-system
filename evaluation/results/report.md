# GhanaTBS — Evaluation Results

Generated 2026-08-24T12:10:29.896Z on Node v24.13.1 (win32 x64).

All figures below are produced by `evaluation/evaluate.cjs`, re-runnable with `npm run evaluate`.

## T1. Route optimisation

Dijkstra's implementation was checked against an independently written Floyd-Warshall all-pairs reference. The two share no code.

| Metric | Result |
|---|---|
| Node pairs tested | 42 |
| Agreement with reference | 42/42 |
| Mean latency (Accra to Tamale) | 10.591 us |
| Median latency | 7.000 us |
| 95th percentile latency | 12.100 us |
| Throughput | 94,423 routes/second |

Selected multi-hop routes, neither of which has a direct edge in the graph:

| Journey | Path discovered | Distance | Duration |
|---|---|---|---|
| Accra to Takoradi | Acc to Cap to Tak | 220 km | 240 min |
| Accra to Tamale | Acc to Kum to Tam | 650 km | 630 min |

## T2. Dispatch model

Bus capacity 44 seats, dispatch threshold 37 seats (85% of capacity). Cells give projected minutes to departure.

| Seats booked | 0/hr | 5/hr | 10/hr | 15/hr | 20/hr | 30/hr | 45/hr | 60/hr | 90/hr | 120/hr |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 120 | 444 | 222 | 148 | 111 | 74 | 49 | 37 | 25 | 19 |
| 10 | 120 | 324 | 162 | 108 | 81 | 54 | 36 | 27 | 18 | 14 |
| 20 | 120 | 204 | 102 | 68 | 51 | 34 | 23 | 17 | 11 | 9 |
| 30 | 120 | 84 | 42 | 28 | 21 | 14 | 9 | 7 | 5 | 4 |
| 37 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## T3. Ticket integrity

| Test | Trials | Result |
|---|---|---|
| Genuine tickets accepted | 5000 | 5000/5000 |
| Tampered `ticketId` detected | 5000 | 5000/5000 |
| Tampered `passengerName` detected | 5000 | 5000/5000 |
| Tampered `seatNumber` detected | 5000 | 5000/5000 |
| Tampered `busNumber` detected | 5000 | 5000/5000 |
| Forged signatures rejected | 5000 | 5000/5000 |
| Avalanche, mean bits changed of 256 | 2000 | 128.1 (50.1%) |
| Collisions, superseded djb2-32 | 200,000 | 1 |
| Collisions, HMAC-SHA256 | 200,000 | 0 |

## T4. Concurrency

Reproduction of the read-modify-write reservation path used by the commuter portal.

| Scenario | Trials | Outcome |
|---|---|---|
| A. Different seats, current write path | 1000 | 1000 reservations silently erased |
| B. Same seat, current write path | 1000 | 1000 double sales |
| C. Different seats, compare-and-set | 1000 | 0 lost, 1000 stale writes rejected and retried |

## T5. Degradation without the cloud database

| Check | Result |
|---|---|
| Exception thrown | none |
| Timetable self-seeded | true (108 buses) |
| Booking written and read back | true |
| Ticket signature survives round trip | true |
| Schedule change persisted | true |
| Audit ledger entry written | true |
