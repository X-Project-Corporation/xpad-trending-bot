// ─── Formatting helpers ──────────────────────────────────────────

function shortAddr(addr) {
  if (!addr) return "???";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function fmtUsd(usd) {
  if (usd == null || usd === 0) return "$0";
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  if (usd >= 1) return `$${usd.toFixed(0)}`;
  return `$${usd.toFixed(4)}`;
}

function fmtPrice(price) {
  if (!price || price === 0) return "$0";
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toExponential(2)}`;
}

function fmtPct(pct) {
  if (pct == null || pct === 0) return "0%";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function fmtNum(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function statusIcon(token) {
  if (token.status === "graduated") return "\ud83c\udf93";
  if (token.bondingProgress >= 50) return "\ud83d\udfe1"; // yellow — halfway
  return "\ud83d\udfe2"; // green — new
}

function statusLabel(token) {
  if (token.status === "graduated") return "Graduated";
  if (token.bondingProgress > 0) return `Bonding ${Math.round(token.bondingProgress)}%`;
  return "New";
}

function tokenAge(token) {
  if (!token.createdAt) return "";
  const ms = Date.now() - new Date(token.createdAt).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)}m old`;
  if (hours < 24) return `${Math.round(hours)}h old`;
  const days = Math.round(hours / 24);
  return `${days}d old`;
}

// ─── Trending list ───────────────────────────────────────────────

export function formatTrendingList(tokens) {
  if (!tokens.length) return "<b>\ud83d\udd25 XPAD TRENDING</b>\n\nNo tokens found yet.";

  const lines = ["<b>\ud83d\udd25 XPAD TRENDING</b>", ""];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const icon = statusIcon(t);
    const change = fmtPct(t.priceChange24h);
    const line1 = `${i + 1}. ${icon} <b>${esc(t.symbol)}</b> \u2014 ${fmtUsd(t.mcap)} MC \u2014 ${change}`;
    const parts = [statusLabel(t)];
    if (t.volume24h > 0) parts.push(`Vol ${fmtUsd(t.volume24h)}`);
    if (t.holders > 0) parts.push(`${fmtNum(t.holders)} holders`);
    const age = tokenAge(t);
    if (age) parts.push(age);
    const line2 = `   ${parts.join(" | ")}`;
    lines.push(line1, line2, "");
  }
  return lines.join("\n");
}

export function formatTrendingButtons(tokens) {
  const rows = [];
  for (const t of tokens) {
    const buttons = [
      { text: "\ud83d\udcc8 Chart", url: `https://xpad.fun/token/${t.address}` },
    ];
    if (t.status === "graduated") {
      buttons.push({ text: "\ud83d\udcb0 Buy", url: `https://xpad.fun/token/${t.address}` });
      buttons.push({ text: "\ud83e\udd84 DexScreener", url: `https://dexscreener.com/ethereum/${t.pairAddress || t.address}` });
    } else {
      buttons.push({ text: "\ud83d\udcb0 Buy on xpad", url: `https://xpad.fun/token/${t.address}` });
    }
    rows.push(buttons);
  }
  return rows;
}

// ─── New launches list ───────────────────────────────────────────

export function formatNewList(tokens) {
  if (!tokens.length) return "<b>\ud83c\udd95 NEW LAUNCHES</b>\n\nNo tokens yet.";

  const lines = ["<b>\ud83c\udd95 NEW LAUNCHES</b>", ""];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const age = tokenAge(t);
    const line1 = `${i + 1}. <b>${esc(t.symbol)}</b> \u2014 ${fmtUsd(t.mcap)} MC`;
    const parts = [statusLabel(t)];
    if (age) parts.push(age);
    if (t.holders > 0) parts.push(`${fmtNum(t.holders)} holders`);
    lines.push(line1, `   ${parts.join(" | ")}`, "");
  }
  return lines.join("\n");
}

// ─── Graduated list ──────────────────────────────────────────────

export function formatGraduatedList(tokens) {
  if (!tokens.length) return "<b>\ud83c\udf93 GRADUATED TOKENS</b>\n\nNo graduated tokens yet.";

  const lines = ["<b>\ud83c\udf93 GRADUATED TOKENS</b>", ""];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const change = fmtPct(t.priceChange24h);
    const line1 = `${i + 1}. <b>${esc(t.symbol)}</b> \u2014 ${fmtUsd(t.mcap)} MC \u2014 ${change}`;
    const parts = [];
    if (t.volume24h > 0) parts.push(`Vol ${fmtUsd(t.volume24h)}`);
    if (t.holders > 0) parts.push(`${fmtNum(t.holders)} holders`);
    if (t.liquidity > 0) parts.push(`Liq ${fmtUsd(t.liquidity)}`);
    lines.push(line1, `   ${parts.join(" | ")}`, "");
  }
  return lines.join("\n");
}

// ─── Token detail ────────────────────────────────────────────────

export function formatTokenDetail(t) {
  const lines = [
    `<b>\ud83c\udff7 ${esc(t.name)} ($${esc(t.symbol)})</b>`,
    "",
    `\ud83d\udcca Price: ${fmtPrice(t.price)}`,
    `\ud83d\udcb0 Market Cap: ${fmtUsd(t.mcap)}`,
  ];
  if (t.liquidity > 0) lines.push(`\ud83d\udca7 Liquidity: ${fmtUsd(t.liquidity)}`);
  lines.push(`\ud83d\udcc8 24h: ${fmtPct(t.priceChange24h)}`);
  if (t.volume24h > 0) lines.push(`\ud83d\udcb5 Volume 24h: ${fmtUsd(t.volume24h)}`);
  if (t.holders > 0) lines.push(`\ud83d\udc65 Holders: ${fmtNum(t.holders)}`);
  lines.push(`\ud83c\udf93 Status: ${statusLabel(t)}`);
  if (t.pairAddress) lines.push(`\ud83d\udd17 Pair: <code>${shortAddr(t.pairAddress)}</code>`);
  lines.push("", `\ud83d\udccd <code>${t.address}</code>`);
  return lines.join("\n");
}

export function formatTokenButtons(t) {
  const rows = [
    [
      { text: "\ud83d\udcc8 Chart", url: `https://xpad.fun/token/${t.address}` },
      { text: "\ud83d\udcb0 Buy", url: `https://xpad.fun/token/${t.address}` },
    ],
  ];
  if (t.status === "graduated") {
    rows.push([
      { text: "\ud83e\udd84 DexScreener", url: `https://dexscreener.com/ethereum/${t.pairAddress || t.address}` },
      { text: "\ud83d\udd0d Etherscan", url: `https://etherscan.io/token/${t.address}` },
    ]);
  } else {
    rows.push([
      { text: "\ud83d\udd0d Etherscan", url: `https://etherscan.io/token/${t.address}` },
    ]);
  }
  return rows;
}

// ─── Platform stats ──────────────────────────────────────────────

export function formatStats(stats) {
  return [
    "<b>\ud83d\udcca XPAD PLATFORM STATS</b>",
    "",
    `\ud83e\ude99 Total Tokens: <b>${fmtNum(stats.totalTokens)}</b>`,
    `\ud83c\udf93 Graduated: <b>${fmtNum(stats.graduated)}</b>`,
    `\ud83d\udfe2 Bonding: <b>${fmtNum(stats.bonding)}</b>`,
    `\ud83d\udcb5 Volume 24h: <b>${fmtUsd(stats.totalVolume24h)}</b>`,
    `\ud83d\udc65 Total Holders: <b>${fmtNum(stats.totalHolders)}</b>`,
  ].join("\n");
}

// ─── Alert messages ──────────────────────────────────────────────

export function formatNewLaunchAlert(t) {
  const lines = [
    `\ud83d\ude80 <b>NEW TOKEN LAUNCHED</b>`,
    "",
    `<b>${esc(t.name)} ($${esc(t.symbol)})</b>`,
  ];
  if (t.mcap > 0) lines.push(`\ud83d\udcb0 MC: ${fmtUsd(t.mcap)}`);
  lines.push("", `<code>${t.address}</code>`);
  return lines.join("\n");
}

export function formatGraduationAlert(t) {
  return [
    `\ud83c\udf93 <b>TOKEN GRADUATED</b>`,
    "",
    `<b>${esc(t.name)} ($${esc(t.symbol)})</b>`,
    `\ud83d\udcb0 MC: ${fmtUsd(t.mcap)}`,
    t.holders > 0 ? `\ud83d\udc65 Holders: ${fmtNum(t.holders)}` : "",
    "",
    `Now trading on Uniswap!`,
  ].filter(Boolean).join("\n");
}

export function formatTrendingAlert(tokens) {
  const lines = ["\ud83d\udd25 <b>TRENDING UPDATE</b>", ""];
  for (let i = 0; i < Math.min(5, tokens.length); i++) {
    const t = tokens[i];
    lines.push(`${i + 1}. ${statusIcon(t)} <b>${esc(t.symbol)}</b> \u2014 ${fmtUsd(t.mcap)} MC \u2014 ${fmtPct(t.priceChange24h)}`);
  }
  return lines.join("\n");
}

// ─── Alerts settings ─────────────────────────────────────────────

export function formatAlertsSettings(alerts) {
  const on = "\u2705";
  const off = "\u274c";
  return [
    "<b>\ud83d\udd14 ALERT SETTINGS</b>",
    "",
    `${alerts.launches ? on : off} New Launches`,
    `${alerts.graduations ? on : off} Graduations`,
    `${alerts.bigBuys ? on : off} Big Buys (>0.1 ETH)`,
    `${alerts.trending ? on : off} Trending Updates (every 4h)`,
    "",
    "Tap to toggle:",
  ].join("\n");
}

export function alertsKeyboard(alerts) {
  return [
    [
      { text: `${alerts.launches ? "\u2705" : "\u274c"} Launches`, callback_data: "alert_toggle_launches" },
      { text: `${alerts.graduations ? "\u2705" : "\u274c"} Graduations`, callback_data: "alert_toggle_graduations" },
    ],
    [
      { text: `${alerts.bigBuys ? "\u2705" : "\u274c"} Big Buys`, callback_data: "alert_toggle_bigBuys" },
      { text: `${alerts.trending ? "\u2705" : "\u274c"} Trending`, callback_data: "alert_toggle_trending" },
    ],
    [{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }],
  ];
}

// ─── Buy alert (from blockchain listener) ───────────────────────

export function formatBuyAlert(trade) {
  const { symbol, ethAmount, usdAmount, mcap, volume24h, buyer, txHash, bondingProgress, graduated } = trade;

  const ethStr = ethAmount < 0.001 ? ethAmount.toFixed(6) : ethAmount < 1 ? ethAmount.toFixed(4) : ethAmount.toFixed(3);
  const usdStr = fmtUsd(usdAmount);
  const mcapStr = mcap ? fmtUsd(mcap) : "N/A";
  const volStr = volume24h ? fmtUsd(volume24h) : "N/A";

  const buyerLink = `<a href="https://etherscan.io/address/${buyer}">Buyer</a>`;
  const txLink = txHash ? ` | <a href="https://etherscan.io/tx/${txHash}">Etherscan</a>` : "";

  const lines = [
    `\ud83d\udfe2 <b>BUY \u2014 $${esc(symbol)}</b>`,
    `\ud83d\udcb0 ${ethStr} ETH (${usdStr})`,
    `\ud83d\udcca MC: ${mcapStr} | Vol 24h: ${volStr}`,
  ];

  if (!graduated && bondingProgress != null && bondingProgress > 0) {
    const pct = Math.round(bondingProgress);
    const filled = Math.round(pct / 10);
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
    lines.push(`\ud83c\udf1f Bonding: [${bar}] ${pct}%`);
  }

  lines.push(`\ud83d\udd17 ${buyerLink}${txLink}`);
  lines.push("");

  const xpadLink = `<a href="https://xpad.fun/token/${trade.tokenAddress}">\ud83d\udcc8 xpad</a>`;
  const dexLink = `<a href="https://dexscreener.com/ethereum/${trade.tokenAddress}">\ud83d\udcca DexScreener</a>`;
  lines.push(`${xpadLink} | ${dexLink}`);

  return lines.join("\n");
}

// ─── Momentum / trending update (every 2h) ──────────────────────

export function formatMomentumUpdate(movers, topVolume, newLaunches) {
  const lines = ["\ud83d\udd25 <b>XPAD TRENDING UPDATE</b>", ""];

  for (const m of movers) {
    const dir = m.change >= 0 ? "+" : "";
    const period = m.period || "1h";
    lines.push(`\ud83d\udcc8 <b>$${esc(m.symbol)}</b> ${dir}${Math.round(m.change)}% (${period}) \u2014 ${fmtUsd(m.mcap)} MC`);
  }

  for (const n of newLaunches) {
    const pct = n.bondingProgress > 0 ? ` \u2014 Bonding ${Math.round(n.bondingProgress)}%` : "";
    lines.push(`\ud83c\udd95 <b>$${esc(n.symbol)}</b> just launched${pct}`);
  }

  if (topVolume) {
    lines.push("");
    lines.push(`\ud83c\udfc6 Top Volume: <b>$${esc(topVolume.symbol)}</b> (${fmtUsd(topVolume.volume24h)} 24h)`);
  }

  return lines.join("\n");
}

// ─── Help text ──────────────────────────────────────────────────

export function formatHelp() {
  return [
    "<b>\ud83d\udc7b xpad Trending Bot \u2014 Help</b>",
    "",
    "/start \u2014 Main menu",
    "/trending \u2014 Top trending tokens",
    "/new \u2014 Latest launches",
    "/graduated \u2014 Graduated tokens",
    "/token &lt;symbol&gt; \u2014 Token details",
    "/stats \u2014 Platform stats",
    "/alerts \u2014 Alert settings",
    "/help \u2014 This message",
    "",
    "The bot automatically posts buy alerts for all xpad tokens in every group it's added to.",
  ].join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
