import test from "node:test";
import assert from "node:assert/strict";
import { withinMcapCap, MAX_MCAP_USD } from "../src/mcap.js";

// Values taken verbatim from the 20 Jul 2026 post that triggered this fix: the bot published
// "TOP TOKENS: 1. cbBTC $6116.7M MC, 2. WETH $4481.4M MC, 4. USDC $73277.2M MC" to every group.
// Those had reached the in-memory cache through the discovery feed and were never evicted.
const REAL_POST = [
  { symbol: "cbBTC", mcap: 6_116_700_000, allowed: false },
  { symbol: "WETH", mcap: 4_481_400_000, allowed: false },
  { symbol: "USDC", mcap: 73_277_200_000, allowed: false },
  { symbol: "WETH", mcap: 524_000_000, allowed: false },
  { symbol: "HMM", mcap: 120_100, allowed: true },
];

test("the exact tokens from the bad post are filtered, the real one is kept", () => {
  for (const t of REAL_POST) {
    assert.equal(withinMcapCap(t), t.allowed, `${t.symbol} @ $${t.mcap}`);
  }
});

test("default cap is 10M", () => {
  assert.equal(MAX_MCAP_USD, 10_000_000);
});

test("boundary is inclusive: exactly at the cap is still allowed", () => {
  assert.equal(withinMcapCap({ mcap: MAX_MCAP_USD }), true);
  assert.equal(withinMcapCap({ mcap: MAX_MCAP_USD + 1 }), false);
});

test("an unknown mcap is allowed, so a fresh launch is never silenced", () => {
  // Silencing brand-new tokens would be a worse failure than the one being fixed.
  assert.equal(withinMcapCap({ mcap: 0 }), true);
  assert.equal(withinMcapCap({ mcap: null }), true);
  assert.equal(withinMcapCap({ mcap: undefined }), true);
  assert.equal(withinMcapCap({}), true);
  assert.equal(withinMcapCap({ mcap: "not a number" }), true);
});

test("string mcaps are compared numerically, not lexicographically", () => {
  // The API returns numeric fields as strings in places, and "9" > "10000000000" as a string.
  assert.equal(withinMcapCap({ mcap: "73277200000" }), false);
  assert.equal(withinMcapCap({ mcap: "120100" }), true);
});
