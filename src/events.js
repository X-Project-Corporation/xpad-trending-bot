// ─── Launch / graduation event detection ─────────────────────────
//
// The fetcher diffs the current token-address set against the previous
// cycle's set. Two failure modes used to spam old tokens as "NEW TOKEN
// LAUNCHED":
//   1. A partial fetch failure (one chain's API call fails) shrank the
//      baseline set, so the recovery cycle saw every token of that chain
//      as "new".
//   2. name+symbol dedupe keeps the highest-mcap duplicate; when two dead
//      duplicates have near-equal mcap the winning address flips back and
//      forth, re-announcing months-old tokens.
// Guard 1: skip detection AND keep the old baseline when any chain fetch
// failed. Guard 2: only announce tokens actually created recently.

export const MAX_LAUNCH_AGE_MS = 60 * 60_000; // 1h

export function detectEvents({
  prevAddrs,
  prevGraduated,
  currentAddrs,
  currentGraduated,
  getToken,
  allChainsOk,
  now = Date.now(),
}) {
  const launches = [];
  const graduations = [];

  if (!allChainsOk) {
    return { launches, graduations, updateBaseline: false };
  }

  if (prevAddrs.size > 0) {
    for (const addr of currentAddrs) {
      if (prevAddrs.has(addr)) continue;
      const t = getToken(addr);
      if (!t || !t.createdAt) continue;
      const age = now - new Date(t.createdAt).getTime();
      if (age <= MAX_LAUNCH_AGE_MS) launches.push(t);
    }
  }

  if (prevGraduated.size > 0) {
    for (const addr of currentGraduated) {
      if (prevGraduated.has(addr)) continue;
      const t = getToken(addr);
      if (t) graduations.push(t);
    }
  }

  return { launches, graduations, updateBaseline: true };
}
