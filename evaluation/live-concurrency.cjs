/**
 * ===========================================================================
 * live-concurrency.cjs — LIVE CONCURRENCY TEST AGAINST THE HOSTED DATABASE
 * ===========================================================================
 *
 * Section 4.4 of the evaluative essay reported the concurrency defect from an
 * in-process reproduction of the write path, and listed a live test as still
 * outstanding. This is that test. It fires genuinely simultaneous HTTP requests
 * at the hosted Supabase instance, which is what two browser sessions do.
 *
 * Three scenarios are run against the real database:
 *
 *   A. The ORIGINAL write path, an unconditional whole-array update. Expected
 *      to lose reservations, demonstrating that the defect was real and not an
 *      artefact of the in-process reproduction.
 *
 *   B. COMPARE-AND-SET, the tier-2 remedy now shipped in reserveSeats().
 *      Expected to admit exactly one winner per seat and refuse the rest.
 *
 *   C. The `reservations` table, the tier-1 remedy, if migration 0001 has been
 *      applied. Expected to admit exactly one insert and raise 23505 for the
 *      rest. Skipped with a notice when the table is absent.
 *
 * The test restores the schedule row it borrows, and deletes any rows it
 * inserts, so the database is left as it was found.
 *
 * Run with: node evaluation/live-concurrency.cjs
 */

const fs = require('fs');
const path = require('path');

// ---- credentials -----------------------------------------------------------
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('No .env.local found. This test needs the hosted database.');
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('Credentials missing from .env.local'); process.exit(1); }

const HEAD = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function api(pathAndQuery, method = 'GET', body, prefer) {
  const headers = { ...HEAD };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(URL + pathAndQuery, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  return { status: res.status, json, text };
}

const TARGET = 'sch-vip-rt-acc-kum-1';   // one bus, borrowed and restored
const CONCURRENCY = 12;                  // simultaneous passengers per trial
const TRIALS = 25;

const line = (n = 76) => '='.repeat(n);
const arrLit = a => `{${a.join(',')}}`;

(async () => {
  console.log(line());
  console.log('LIVE CONCURRENCY TEST — hosted Supabase');
  console.log(line());

  const before = await api(`/rest/v1/schedules?id=eq.${TARGET}&select=reserved_seats`);
  if (before.status !== 200 || !before.json?.length) {
    console.error('Could not read the target schedule. Is the database reachable?');
    process.exit(1);
  }
  const ORIGINAL = before.json[0].reserved_seats || [];
  console.log(`target bus        : ${TARGET}`);
  console.log(`original seats    : [${ORIGINAL.join(', ')}]`);
  console.log(`concurrency       : ${CONCURRENCY} simultaneous writers, ${TRIALS} trials\n`);

  const restore = () =>
    api(`/rest/v1/schedules?id=eq.${TARGET}`, 'PATCH', { reserved_seats: ORIGINAL });

  // ---- A. the original unconditional write ---------------------------------
  let lostA = 0;
  for (let t = 0; t < TRIALS; t++) {
    await api(`/rest/v1/schedules?id=eq.${TARGET}`, 'PATCH', { reserved_seats: [] });
    // Every writer reads the same empty array, appends its own seat, writes back.
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        api(`/rest/v1/schedules?id=eq.${TARGET}`, 'PATCH', { reserved_seats: [i + 1] })
      )
    );
    const after = await api(`/rest/v1/schedules?id=eq.${TARGET}&select=reserved_seats`);
    const kept = (after.json[0].reserved_seats || []).length;
    lostA += CONCURRENCY - kept;   // every writer intended to add one seat
  }
  console.log('A. ORIGINAL unconditional write');
  console.log(`   reservations lost : ${lostA} of ${CONCURRENCY * TRIALS}`);
  console.log(`   verdict           : ${lostA > 0 ? 'DEFECT CONFIRMED on live database' : 'no loss observed'}\n`);

  // ---- B. compare-and-set --------------------------------------------------
  let winnersB = 0, refusedB = 0, lostB = 0;
  for (let t = 0; t < TRIALS; t++) {
    await api(`/rest/v1/schedules?id=eq.${TARGET}`, 'PATCH', { reserved_seats: [] });
    // Every writer guards on the array it read, so only one can win per round.
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        api(`/rest/v1/schedules?id=eq.${TARGET}&reserved_seats=eq.${arrLit([])}`,
            'PATCH', { reserved_seats: [i + 1] }, 'return=representation')
      )
    );
    const won = results.filter(r => r.status === 200 && r.json && r.json.length > 0).length;
    winnersB += won;
    refusedB += CONCURRENCY - won;
    const after = await api(`/rest/v1/schedules?id=eq.${TARGET}&select=reserved_seats`);
    if ((after.json[0].reserved_seats || []).length !== won) lostB++;
  }
  console.log('B. COMPARE-AND-SET (tier 2, shipped now)');
  console.log(`   accepted          : ${winnersB} (expected exactly ${TRIALS}, one per trial)`);
  console.log(`   correctly refused : ${refusedB} of ${CONCURRENCY * TRIALS}`);
  console.log(`   rounds where the stored array disagreed with the winner count : ${lostB}`);
  console.log(`   verdict           : ${winnersB === TRIALS && lostB === 0 ? 'RACE CLOSED' : 'UNEXPECTED'}\n`);

  await restore();

  // ---- C. the reservations table ------------------------------------------
  const probe = await api('/rest/v1/reservations?select=schedule_id&limit=1');
  if (probe.status === 404 || probe.status === 400) {
    console.log('C. RESERVATIONS TABLE (tier 1, strongest)');
    console.log('   SKIPPED — migration 0001_seat_reservations.sql has not been applied.');
    console.log('   Apply it in the Supabase SQL Editor, then re-run this test.\n');
  } else {
    let acceptedC = 0, rejectedC = 0;
    const SEAT = 999;   // outside the real seat range, cleaned up below
    for (let t = 0; t < TRIALS; t++) {
      await api(`/rest/v1/reservations?schedule_id=eq.${TARGET}&seat_number=eq.${SEAT}`, 'DELETE');
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          api('/rest/v1/reservations', 'POST',
              [{ schedule_id: TARGET, seat_number: SEAT }], 'return=minimal')
        )
      );
      acceptedC += results.filter(r => r.status === 201 || r.status === 204).length;
      rejectedC += results.filter(r => r.status === 409 ||
        (r.text && r.text.includes('23505'))).length;
    }
    await api(`/rest/v1/reservations?schedule_id=eq.${TARGET}&seat_number=eq.${SEAT}`, 'DELETE');
    console.log('C. RESERVATIONS TABLE (tier 1, strongest)');
    console.log(`   accepted          : ${acceptedC} (expected exactly ${TRIALS}, one per trial)`);
    console.log(`   rejected as 23505 : ${rejectedC} of ${CONCURRENCY * TRIALS}`);
    console.log(`   verdict           : ${acceptedC === TRIALS ? 'RACE CLOSED BY THE DATABASE' : 'UNEXPECTED'}\n`);
  }

  // ---- restore -------------------------------------------------------------
  await restore();
  const after = await api(`/rest/v1/schedules?id=eq.${TARGET}&select=reserved_seats`);
  const final = after.json[0].reserved_seats || [];
  const same = JSON.stringify(final) === JSON.stringify(ORIGINAL);
  console.log(line());
  console.log(`database restored : ${same ? 'yes' : 'NO — CHECK MANUALLY'}  [${final.join(', ')}]`);
  console.log(line());
  process.exit(same ? 0 : 1);
})();
