import { XPAD_API_URL, CHAINS } from "./config.js";

// ─── Hidden tokens (test/spam) ─────────────────────────────────

const HIDDEN_TOKENS = new Set([
  '0x71cbbdaa723f9b892f42d76e53e5e404495ddef1', // PEKKA
  '0xd8e9db16328a4aacae21f34f811a5572d7f7def1', // MCDUCK
  '0xe14c2c4728bb60fac60000ae34bac076f3b2def1', // WAGMIKID
  '0xtestimagecheck123456789012345678901234',     // ImageTest
  '0x653349f4c2c7407000fbc4094663cd9d58afdef1',
  '0x99f9d3ad405d14349aa2d957957c5fa98acbd6ff',
  '0xd7e7c6c988c9646d2988fbc4ebfebd3ab0f07c25',
  '0x68b3dc6e4dbba6e4e6838274b5e212c870cddef1',
]);

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
  // Use real volume and price change for scoring
  const vol = token.volume24h || 0;
  const change = token.priceChange24h || 0;

  // Base: volume * momentum multiplier
  let score = vol * (1 + change / 100);

  // Age factor: newer tokens get a boost
  if (token.createdAt) {
    const ageHours = (Date.now() - new Date(token.createdAt).getTime()) / 3_600_000;
    if (ageHours < 1) score *= 3;
    else if (ageHours < 6) score *= 2;
    else if (ageHours < 24) score *= 1.5;
    else if (ageHours < 72) score *= 1.2;
  }

  // Bonding curve speed boost
  if (token.status === "bonding" && token.bondingProgress > 0 && token.createdAt) {
    const ageHours = (Date.now() - new Date(token.createdAt).getTime()) / 3_600_000;
    if (ageHours > 0) {
      const fillRate = token.bondingProgress / ageHours;
      score += fillRate * 100;
    }
  }

  // Fallback: if no volume data, use mcap as a weak signal
  if (vol === 0 && token.mcap > 0) {
    score += token.mcap * 0.001;
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
      return (b.mcap || 0) - (a.mcap || 0);
    });
  return sorted.slice(0, limit);
}

// ─── Platform stats ──────────────────────────────────────────────

export function getPlatformStats() {
  const all = [...tokens.values()];
  const graduated = all.filter((t) => t.status === "graduated").length;
  const totalVolume = all.reduce((s, t) => s + (t.volume24h || 0), 0);
  const totalHolders = all.reduce((s, t) => s + (t.holders || 0), 0);
  const totalMcap = all.reduce((s, t) => s + (t.mcap || 0), 0);

  return {
    totalTokens: all.length,
    graduated,
    bonding: all.length - graduated,
    totalVolume24h: totalVolume,
    totalHolders,
    totalMcap,
  };
}

// ─── Deduplication helper ────────────────────────────────────────

function dedupeTokenList(tokenList) {
  const seen = new Map(); // key: "name|symbol" -> best token (highest mcap)
  const result = [];
  for (const raw of tokenList) {
    const name = (raw.name || "").toLowerCase().trim();
    const symbol = (raw.symbol || "").toLowerCase().trim();
    const key = `${name}|${symbol}`;
    const mcap = parseNum(raw.marketCap ?? raw.mcap ?? 0);
    if (seen.has(key)) {
      const prev = seen.get(key);
      // Keep the one with higher mcap or more recent creation
      if (mcap > prev.mcap) {
        seen.set(key, { index: result.length, mcap, raw });
        // Replace in result
        result[prev.index] = raw;
      }
      // Otherwise skip this duplicate
    } else {
      seen.set(key, { index: result.length, mcap, raw });
      result.push(raw);
    }
  }
  return result.filter(Boolean);
}

// ─── Fetch loop ──────────────────────────────────────────────────

let lastSnapshotTime = 0;

async function fetchAllTokens() {
  try {
    // Fetch from both chains in parallel
    const [ethRes, baseRes] = await Promise.allSettled([
      fetch(`${XPAD_API_URL}/api/v1/tokens?limit=200&chain=1`),
      fetch(`${XPAD_API_URL}/api/v1/tokens?limit=200&chain=8453`),
    ]);

    let tokenList = [];
    for (const [chainKey, result] of [["ethereum", ethRes], ["base", baseRes]]) {
      if (result.status !== "fulfilled" || !result.value.ok) continue;
      const json = await result.value.json();
      const list = Array.isArray(json) ? json : json.tokens || [];
      // Tag each token with its chain
      for (const t of list) {
        t._chainKey = chainKey;
        t._chainId = CHAINS[chainKey].chainId;
      }
      tokenList.push(...list);
    }

    // Deduplicate tokens with same name+symbol
    tokenList = dedupeTokenList(tokenList);

    const currentAddrs = new Set();
    const currentGraduated = new Set();

    // First pass: basic data from DB API, filter hidden tokens
    const validTokens = [];
    for (const raw of tokenList) {
      const addr = (raw.tokenAddress || raw.address || "").toLowerCase();
      if (!addr) continue;
      if (HIDDEN_TOKENS.has(addr)) continue;
      validTokens.push({ raw, addr });
      currentAddrs.add(addr);
    }

    // Second pass: fetch real data from Trade API for top tokens
    // Limit to 15 concurrent requests to avoid hammering the API
    const toEnrich = validTokens.slice(0, 15);
    const tradeDataMap = new Map();

    const tradePromises = toEnrich.map(async ({ addr }) => {
      try {
        const tRes = await fetch(
          `${XPAD_API_URL}/trade/token-info?tokenAddress=${addr}`
        );
        if (tRes.ok) {
          const data = await tRes.json();
          tradeDataMap.set(addr, data);
        }
      } catch {}
    });
    await Promise.all(tradePromises);

    // Third pass: for graduated tokens with pairAddress, fetch DexScreener
    const dexDataMap = new Map();
    const dexPromises = [];
    for (const [addr, tData] of tradeDataMap) {
      const isGrad = tData.graduated === true || tData.status === "graduated";
      const pairAddr = tData.pairAddress || tData.pair;
      if (isGrad && pairAddr) {
        dexPromises.push(
          (async () => {
            try {
              const dexChain = CHAINS[tData._chainKey || "ethereum"]?.dexScreenerChain || "ethereum";
              const dRes = await fetch(
                `https://api.dexscreener.com/latest/dex/pairs/${dexChain}/${pairAddr}`
              );
              if (dRes.ok) {
                const dJson = await dRes.json();
                const pair = dJson.pair || dJson.pairs?.[0];
                if (pair) dexDataMap.set(addr, pair);
              }
            } catch {}
          })()
        );
      }
    }
    await Promise.all(dexPromises);

    // Build token objects
    for (const { raw, addr } of validTokens) {
      const detail = tradeDataMap.get(addr) || null;
      const dex = dexDataMap.get(addr) || null;

      const isGraduated =
        raw.status === "graduated" ||
        raw.graduated === true ||
        detail?.graduated === true ||
        detail?.status === "graduated";

      if (isGraduated) currentGraduated.add(addr);

      const existing = tokens.get(addr) || {};

      // Parse Trade API values as floats (API returns strings!)
      const tradeMcap = detail ? parseNum(detail.mcapUsd ?? detail.marketCap ?? detail.mcap) : 0;
      const tradePrice = detail ? parseNum(detail.priceUsd ?? detail.price) : 0;
      const tradeLiquidity = detail ? parseNum(detail.liquidityEth ?? detail.liquidity) : 0;

      // DexScreener overrides for graduated tokens
      const dexMcap = dex ? parseNum(dex.marketCap ?? dex.fdv) : 0;
      const dexVolume = dex ? parseNum(dex.volume?.h24) : 0;
      const dexChange = dex ? parseNum(dex.priceChange?.h24) : 0;
      const dexLiquidity = dex ? parseNum(dex.liquidity?.usd) : 0;
      const dexPrice = dex ? parseNum(dex.priceUsd) : 0;

      const token = {
        address: addr,
        chainKey: raw._chainKey || existing.chainKey || "ethereum",
        name: raw.name || detail?.name || existing.name || "Unknown",
        symbol: raw.symbol || detail?.symbol || existing.symbol || "???",
        status: isGraduated ? "graduated" : "bonding",
        createdAt: raw.createdAt || raw.created_at || detail?.createdAt || existing.createdAt || null,
        mcap: dexMcap || tradeMcap || parseNum(raw.marketCap ?? raw.mcap),
        price: dexPrice || tradePrice || parseNum(raw.price),
        volume24h: dexVolume || parseNum(detail?.volume24h ?? detail?.volume ?? raw.volume24h ?? raw.volume),
        priceChange24h: dexChange || parseNum(detail?.priceChange24h ?? detail?.change24h ?? raw.priceChange24h),
        holders: parseInt(detail?.holders ?? detail?.holderCount ?? raw.holders ?? 0) || 0,
        liquidity: dexLiquidity || tradeLiquidity || parseNum(raw.liquidity),
        bondingProgress: parseNum(detail?.bondingProgress ?? detail?.progress ?? raw.bondingProgress ?? raw.progress),
        buys1h: parseInt(detail?.buys1h ?? detail?.txns1h ?? 0) || 0,
        buys24h: parseInt(detail?.buys24h ?? detail?.txns24h ?? 0) || 0,
        imageUrl: raw.imageUrl || raw.image || detail?.imageUrl || existing.imageUrl || null,
        pairAddress: detail?.pairAddress ?? detail?.pair ?? raw.pairAddress ?? existing.pairAddress ?? null,
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

    console.log(`Fetched ${validTokens.length} tokens (${currentGraduated.size} graduated, ${tokenList.length - validTokens.length} hidden/duped)`);
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
