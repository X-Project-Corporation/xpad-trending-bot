import { XPAD_API_URL } from "./config.js";

// ─── In-memory token data ────────────────────────────────────────

/** All tokens keyed by address (lowercase). */
const tokens = new Map();

/** Price snapshots: address -> [{ ts, price, mcap, volume24h, buys24h }] */
const snapshots = new Map();

/** Previous token list for detecting new launches & graduations. */
let prevTokenAddrs = new Set();
let prevGraduated = new Set();

/** Callbacks for events. */
let onNewLaunch = null;
let onGraduation = null;

const SNAPSHOT_INTERVAL = 5 * 60_000;   // 5 min
const SNAPSHOT_RETENTION = 24 * 60 * 60_000; // 24h
const FETCH_INTERVAL = 60_000;          // 60s

// ─── Public API ──────────────────────────────────────────────────

export function setCallbacks({ onNewLaunch: nl, onGraduation: grad }) {
  onNewLaunch = nl;
  onGraduation = grad;
}

export function getAllTokens() {
  return [...tokens.values()];
}

export function getToken(addressOrSymbol) {
  const q = addressOrSymbol.toLowerCase();
  // Try by address first
  if (tokens.has(q)) return tokens.get(q);
  // Try by symbol
  for (const t of tokens.values()) {
    if (t.symbol && t.symbol.toLowerCase() === q) return t;
  }
  return null;
}

export function getSnapshots(address) {
  return snapshots.get(address.toLowerCase()) || [];
}

// ─── Trending score ──────────────────────────────────────────────

export function getTrending(limit = 10) {
  const scored = [];
  for (const t of tokens.values()) {
    scored.push({ ...t, trendingScore: computeScore(t) });
  }
  scored.sort((a, b) => b.trendingScore - a.trendingScore);
  return scored.slice(0, limit);
}

function computeScore(token) {
  let score = 0;

  // Volume 24h (log scale, max ~50 pts)
  const vol = token.volume24h || 0;
  if (vol > 0) score += Math.min(50, Math.log10(vol + 1) * 12);

  // Price change % (bigger moves = more trending, max 30 pts)
  const priceChange = Math.abs(token.priceChange24h || 0);
  score += Math.min(30, priceChange * 0.3);

  // Buys in last hour (max 20 pts)
  const buysHour = token.buys1h || 0;
  score += Math.min(20, buysHour * 2);

  // Age boost: tokens < 24h get up to 15 pts
  if (token.createdAt) {
    const ageHours = (Date.now() - new Date(token.createdAt).getTime()) / 3_600_000;
    if (ageHours < 24) score += Math.max(0, 15 - ageHours * 0.625);
  }

  // Bonding curve speed: fast fill = trending (max 15 pts)
  if (token.status === "bonding" && token.bondingProgress > 0) {
    const ageHours = token.createdAt
      ? (Date.now() - new Date(token.createdAt).getTime()) / 3_600_000
      : 24;
    if (ageHours > 0) {
      const fillRate = token.bondingProgress / ageHours;
      score += Math.min(15, fillRate * 3);
    }
  }

  return Math.round(score * 100) / 100;
}

// ─── New / graduated lists ───────────────────────────────────────

export function getNewTokens(limit = 10) {
  const sorted = [...tokens.values()]
    .filter((t) => t.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return sorted.slice(0, limit);
}

export function getGraduatedTokens(limit = 10) {
  const sorted = [...tokens.values()]
    .filter((t) => t.status === "graduated")
    .sort((a, b) => {
      // Sort by graduation time if available, otherwise by market cap
      return (b.mcap || 0) - (a.mcap || 0);
    });
  return sorted.slice(0, limit);
}

// ─── Platform stats ──────────────────────────────────────────────

export function getPlatformStats() {
  const all = [...tokens.values()];
  const graduated = all.filter((t) => t.status === "graduated").length;
  const totalVolume = all.reduce((s, t) => s + (t.volume24h || 0), 0);
  const activeTraders = new Set();
  // We don't have per-trader data from the API, so use holder counts
  const totalHolders = all.reduce((s, t) => s + (t.holders || 0), 0);

  return {
    totalTokens: all.length,
    graduated,
    bonding: all.length - graduated,
    totalVolume24h: totalVolume,
    totalHolders,
  };
}

// ─── Fetch loop ──────────────────────────────────────────────────

let lastSnapshotTime = 0;

async function fetchAllTokens() {
  try {
    const res = await fetch(`${XPAD_API_URL}/api/v1/tokens?limit=200`);
    if (!res.ok) throw new Error(`Token list ${res.status}`);
    const list = await res.json();
    const tokenList = Array.isArray(list) ? list : list.tokens || [];

    const currentAddrs = new Set();
    const currentGraduated = new Set();

    for (const raw of tokenList) {
      const addr = (raw.tokenAddress || raw.address || "").toLowerCase();
      if (!addr) continue;
      currentAddrs.add(addr);

      // Fetch detailed info
      let detail = null;
      try {
        const dRes = await fetch(
          `${XPAD_API_URL}/trade/token-info?tokenAddress=${addr}`
        );
        if (dRes.ok) detail = await dRes.json();
      } catch {}

      const isGraduated =
        raw.status === "graduated" ||
        raw.graduated === true ||
        detail?.graduated === true ||
        detail?.status === "graduated";

      if (isGraduated) currentGraduated.add(addr);

      const existing = tokens.get(addr) || {};
      const token = {
        address: addr,
        name: raw.name || detail?.name || existing.name || "Unknown",
        symbol: raw.symbol || detail?.symbol || existing.symbol || "???",
        status: isGraduated ? "graduated" : "bonding",
        createdAt: raw.createdAt || raw.created_at || detail?.createdAt || existing.createdAt || null,
        mcap: parseNum(detail?.marketCap ?? detail?.mcap ?? raw.marketCap ?? raw.mcap),
        price: parseNum(detail?.price ?? raw.price),
        volume24h: parseNum(detail?.volume24h ?? detail?.volume ?? raw.volume24h ?? raw.volume),
        priceChange24h: parseNum(detail?.priceChange24h ?? detail?.change24h ?? raw.priceChange24h),
        holders: parseInt(detail?.holders ?? detail?.holderCount ?? raw.holders ?? 0) || 0,
        liquidity: parseNum(detail?.liquidity ?? raw.liquidity),
        bondingProgress: parseNum(detail?.bondingProgress ?? detail?.progress ?? raw.bondingProgress ?? raw.progress),
        buys1h: parseInt(detail?.buys1h ?? detail?.txns1h ?? 0) || 0,
        buys24h: parseInt(detail?.buys24h ?? detail?.txns24h ?? 0) || 0,
        imageUrl: raw.imageUrl || raw.image || detail?.imageUrl || existing.imageUrl || null,
        pairAddress: detail?.pairAddress ?? raw.pairAddress ?? existing.pairAddress ?? null,
      };

      tokens.set(addr, token);
    }

    // Detect new launches
    if (prevTokenAddrs.size > 0 && onNewLaunch) {
      for (const addr of currentAddrs) {
        if (!prevTokenAddrs.has(addr)) {
          const t = tokens.get(addr);
          if (t) onNewLaunch(t);
        }
      }
    }

    // Detect graduations
    if (prevGraduated.size > 0 && onGraduation) {
      for (const addr of currentGraduated) {
        if (!prevGraduated.has(addr)) {
          const t = tokens.get(addr);
          if (t) onGraduation(t);
        }
      }
    }

    prevTokenAddrs = currentAddrs;
    prevGraduated = currentGraduated;

    // Take snapshots every 5 min
    const now = Date.now();
    if (now - lastSnapshotTime >= SNAPSHOT_INTERVAL) {
      lastSnapshotTime = now;
      for (const t of tokens.values()) {
        const addr = t.address;
        if (!snapshots.has(addr)) snapshots.set(addr, []);
        const snaps = snapshots.get(addr);
        snaps.push({
          ts: now,
          price: t.price,
          mcap: t.mcap,
          volume24h: t.volume24h,
          buys24h: t.buys24h,
        });
        // Prune old snapshots
        const cutoff = now - SNAPSHOT_RETENTION;
        while (snaps.length > 0 && snaps[0].ts < cutoff) snaps.shift();
      }
    }

    console.log(`Fetched ${tokenList.length} tokens (${currentGraduated.size} graduated)`);
  } catch (err) {
    console.error("Fetch error:", err.message);
  }
}

function parseNum(v) {
  if (v == null) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function startFetcher() {
  // Initial fetch
  fetchAllTokens();
  // Recurring fetch every 60s
  setInterval(fetchAllTokens, FETCH_INTERVAL);
}
