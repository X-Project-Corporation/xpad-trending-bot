import test from "node:test";
import assert from "node:assert/strict";
import { detectEvents, MAX_LAUNCH_AGE_MS } from "../src/events.js";

const NOW = 1_800_000_000_000;

function mkTokens(entries) {
  const map = new Map(entries.map((t) => [t.address, t]));
  return (addr) => map.get(addr) || null;
}

test("fresh token appearing is announced as a launch", () => {
  const fresh = { address: "0xa", createdAt: new Date(NOW - 5 * 60_000).toISOString() };
  const { launches, updateBaseline } = detectEvents({
    prevAddrs: new Set(["0xb"]),
    prevGraduated: new Set(),
    currentAddrs: new Set(["0xa", "0xb"]),
    currentGraduated: new Set(),
    getToken: mkTokens([fresh]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(launches.map((t) => t.address), ["0xa"]);
  assert.equal(updateBaseline, true);
});

test("old token reappearing (dedupe flip / API flap) is NOT announced", () => {
  const old = { address: "0xa", createdAt: new Date(NOW - 90 * 24 * 3_600_000).toISOString() };
  const { launches } = detectEvents({
    prevAddrs: new Set(["0xb"]),
    prevGraduated: new Set(),
    currentAddrs: new Set(["0xa", "0xb"]),
    currentGraduated: new Set(),
    getToken: mkTokens([old]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(launches, []);
});

test("token with no createdAt is NOT announced", () => {
  const noDate = { address: "0xa", createdAt: null };
  const { launches } = detectEvents({
    prevAddrs: new Set(["0xb"]),
    prevGraduated: new Set(),
    currentAddrs: new Set(["0xa", "0xb"]),
    currentGraduated: new Set(),
    getToken: mkTokens([noDate]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(launches, []);
});

test("createdAt slightly in the future (clock skew) still announces", () => {
  const skewed = { address: "0xa", createdAt: new Date(NOW + 30_000).toISOString() };
  const { launches } = detectEvents({
    prevAddrs: new Set(["0xb"]),
    prevGraduated: new Set(),
    currentAddrs: new Set(["0xa", "0xb"]),
    currentGraduated: new Set(),
    getToken: mkTokens([skewed]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(launches.map((t) => t.address), ["0xa"]);
});

test("partial chain failure: no events, baseline preserved", () => {
  const fresh = { address: "0xa", createdAt: new Date(NOW - 60_000).toISOString() };
  const { launches, graduations, updateBaseline } = detectEvents({
    prevAddrs: new Set(["0xb", "0xc"]),
    prevGraduated: new Set(["0xc"]),
    currentAddrs: new Set(["0xa"]), // eth chain missing this cycle
    currentGraduated: new Set(),
    getToken: mkTokens([fresh]),
    allChainsOk: false,
    now: NOW,
  });
  assert.deepEqual(launches, []);
  assert.deepEqual(graduations, []);
  assert.equal(updateBaseline, false);
});

test("first cycle (empty baseline) announces nothing but sets baseline", () => {
  const fresh = { address: "0xa", createdAt: new Date(NOW - 60_000).toISOString() };
  const { launches, updateBaseline } = detectEvents({
    prevAddrs: new Set(),
    prevGraduated: new Set(),
    currentAddrs: new Set(["0xa"]),
    currentGraduated: new Set(),
    getToken: mkTokens([fresh]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(launches, []);
  assert.equal(updateBaseline, true);
});

test("new graduation is announced; existing ones are not", () => {
  const grad = { address: "0xg", createdAt: new Date(NOW - 10 * 24 * 3_600_000).toISOString() };
  const { graduations } = detectEvents({
    prevAddrs: new Set(["0xg", "0xh"]),
    prevGraduated: new Set(["0xh"]),
    currentAddrs: new Set(["0xg", "0xh"]),
    currentGraduated: new Set(["0xg", "0xh"]),
    getToken: mkTokens([grad, { address: "0xh" }]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(graduations.map((t) => t.address), ["0xg"]);
});

test("boundary: exactly MAX_LAUNCH_AGE_MS old still announces, older does not", () => {
  const atLimit = { address: "0xa", createdAt: new Date(NOW - MAX_LAUNCH_AGE_MS).toISOString() };
  const past = { address: "0xb", createdAt: new Date(NOW - MAX_LAUNCH_AGE_MS - 1).toISOString() };
  const { launches } = detectEvents({
    prevAddrs: new Set(["0xz"]),
    prevGraduated: new Set(),
    currentAddrs: new Set(["0xa", "0xb", "0xz"]),
    currentGraduated: new Set(),
    getToken: mkTokens([atLimit, past]),
    allChainsOk: true,
    now: NOW,
  });
  assert.deepEqual(launches.map((t) => t.address), ["0xa"]);
});
