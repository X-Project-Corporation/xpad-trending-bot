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
  if (days < 30) return `${days}d old`;
  const months = Math.round(days / 30);
  return `${months}mo old`;
}

function bondingBar(progress) {
  if (!progress || progress <= 0) return "";
  const pct = Math.min(Math.round(progress), 100);
  const filled = Math.round(pct / 6.25); // 16 chars total
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(16 - filled);
  return `${bar} ${pct}%`;
}

function timeAgo() {
  return "just now";
}

// Chain-aware URL helpers
function tokenUrl(t) {
  const path = t.chainKey === "base" ? "base" : "eth";
  return `https://xpad.fun/${path}/${t.address}`;
}

function explorerUrl(t) {
  return t.chainKey === "base" ? "https://basescan.org" : "https://etherscan.io";
}

function dexScreenerUrl(t) {
  const chain = t.chainKey === "base" ? "base" : "ethereum";
  return `https://dexscreener.com/${chain}/${t.pairAddress || t.address}`;
}

function chainBadge(t) {
  return t.chainKey === "base" ? "\ud83d\udd35" : "\u26aa"; // 🔵 Base, ⚪ ETH
}

// ─── Welcome / Start (private chat) ─────────────────────────────

export function formatWelcome(stats) {
  const totalTokens = stats?.totalTokens || 0;
  const graduated = stats?.graduated || 0;
  const totalVol = stats?.totalVolume24h || 0;
  const volStr = totalVol > 0 ? fmtUsd(totalVol) : "$0";

  return [
    `<b>\ud83c\udfc6 XPAD TRENDING</b>`,
    ``,
    `The #1 trending tracker for xpad.fun tokens.`,
    ``,
    `Track every token. Catch every pump. Never miss a graduation.`,
    ``,
    `\ud83d\udcca <b>${fmtNum(totalTokens)}</b> tokens tracked | <b>${fmtNum(graduated)}</b> graduated | <b>${volStr}</b> total volume`,
  ].join("\n");
}

export function welcomeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "\ud83d\udd25 Trending Now", callback_data: "menu_trending" },
        { text: "\ud83c\udd95 New Launches", callback_data: "menu_new" },
      ],
      [
        { text: "\ud83c\udf93 Graduated", callback_data: "menu_graduated" },
        { text: "\ud83d\udcca Platform Stats", callback_data: "menu_stats" },
      ],
      [
        { text: "\ud83d\udd14 My Alerts", callback_data: "menu_alerts" },
        { text: "\u2699\ufe0f Settings", callback_data: "menu_settings" },
      ],
      [
        { text: "\ud83d\udc8e Top Holders", callback_data: "menu_top_holders" },
        { text: "\ud83d\udc0b Whale Alerts", callback_data: "menu_whale_alerts" },
      ],
    ],
  };
}

// ─── Welcome / Start (group chat) ───────────────────────────────

export function formatGroupWelcome() {
  return [
    `<b>\ud83c\udfc6 XPAD TRENDING BOT is active!</b>`,
    ``,
    `\ud83d\udce1 Posting all buys automatically`,
    `\ud83d\udd25 Trending updates every 2h`,
    `\ud83c\udf93 Graduation alerts`,
    ``,
    `Use /trending, /token XCEO, /stats in this group.`,
    `Manage alerts: DM @xpad_trending_bot`,
  ].join("\n");
}

// ─── Trending list ───────────────────────────────────────────────

export function formatTrendingList(tokens) {
  if (!tokens.length) {
    return [
      `<b>\ud83d\udd25 XPAD TRENDING</b>`,
      ``,
      `No tokens found yet. Check back soon!`,
    ].join("\n");
  }

  const lines = [
    `<b>\ud83d\udd25 XPAD TRENDING</b> \u2014 Updated ${timeAgo()}`,
    ``,
    `\u2501\u2501\u2501 TOP TOKENS BY MOMENTUM \u2501\u2501\u2501`,
    ``,
  ];

  const medals = ["1\ufe0f\u20e3", "2\ufe0f\u20e3", "3\ufe0f\u20e3", "4\ufe0f\u20e3", "5\ufe0f\u20e3", "6\ufe0f\u20e3", "7\ufe0f\u20e3", "8\ufe0f\u20e3", "9\ufe0f\u20e3", "\ud83d\udd1f"];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const num = medals[i] || `${i + 1}.`;
    const name = t.name && t.name !== t.symbol ? ` \u00b7 ${esc(t.name)}` : "";
    const badge = chainBadge(t);

    lines.push(`${num} ${badge} <b>${esc(t.symbol)}</b>${name}`);

    // Line 2: MC + price change
    const mcStr = t.mcap > 0 ? `\ud83d\udcb0 ${fmtUsd(t.mcap)} MC` : "";
    const changeStr = t.priceChange24h ? `\ud83d\udcc8 ${fmtPct(t.priceChange24h)} 24h` : "";
    const parts2 = [mcStr, changeStr].filter(Boolean);
    if (parts2.length) lines.push(`   ${parts2.join(" \u00b7 ")}`);

    // Line 3: Liquidity + Volume
    const liqStr = t.liquidity > 0 ? `\ud83d\udca7 ${fmtUsd(t.liquidity)} Liq` : "";
    const volStr = t.volume24h > 0 ? `\ud83d\udcca ${fmtUsd(t.volume24h)} Vol 24h` : "";
    const parts3 = [liqStr, volStr].filter(Boolean);
    if (parts3.length) lines.push(`   ${parts3.join(" \u00b7 ")}`);

    // Line 4: Holders + Status
    if (t.status === "graduated") {
      const holderStr = t.holders > 0 ? `\ud83d\udc65 ${fmtNum(t.holders)} holders \u00b7 ` : "";
      lines.push(`   ${holderStr}\ud83c\udf93 Graduated`);
      lines.push(`   \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501 \ud83d\udfe2`);
    } else {
      const age = tokenAge(t);
      const ageStr = age ? `\ud83c\udd95 ${age}` : "";
      const bondStr = t.bondingProgress > 0 ? `\ud83d\udfe3 Bonding ${Math.round(t.bondingProgress)}%` : "";
      const parts4 = [ageStr, bondStr].filter(Boolean);
      if (parts4.length) lines.push(`   ${parts4.join(" \u00b7 ")}`);
      if (t.bondingProgress > 0) {
        lines.push(`   ${bondingBar(t.bondingProgress)}`);
      }
    }

    lines.push("");
  }

  lines.push(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  return lines.join("\n");
}

export function formatTrendingButtons() {
  return [
    [
      { text: "\ud83d\udd04 Refresh", callback_data: "menu_trending" },
      { text: "\ud83d\udcca Full Stats", callback_data: "menu_stats" },
    ],
    [{ text: "\ud83d\udd19 Menu", callback_data: "back_main" }],
  ];
}

// ─── New launches list ──────────────────────────────────────────

export function formatNewList(tokens) {
  if (!tokens.length) {
    return [
      `<b>\ud83c\udd95 LATEST XPAD LAUNCHES</b>`,
      ``,
      `No tokens launched yet. Check back soon!`,
    ].join("\n");
  }

  const lines = [`<b>\ud83c\udd95 LATEST XPAD LAUNCHES</b>`, ``];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const age = tokenAge(t);
    const mcStr = t.mcap > 0 ? `${fmtUsd(t.mcap)} MC` : "$0 MC";
    const bondStr = t.bondingProgress > 0 ? `Bonding ${Math.round(t.bondingProgress)}%` : "New";

    const parts = [`${age}`, mcStr, bondStr].filter(Boolean);
    lines.push(`${i + 1}. <b>${esc(t.symbol)}</b> \u00b7 ${parts.join(" \u00b7 ")}`);
  }
  return lines.join("\n");
}

export function formatNewButtons(tokens) {
  const buttons = tokens.slice(0, 5).map((t) => [
    { text: `${chainBadge(t)} ${t.symbol}`, url: tokenUrl(t) },
    { text: "\ud83d\udcb0 Buy", url: tokenUrl(t) },
  ]);
  buttons.push([{ text: "\ud83d\udd19 Menu", callback_data: "back_main" }]);
  return buttons;
}

// ─── Graduated list ─────────────────────────────────────────────

export function formatGraduatedList(tokens) {
  if (!tokens.length) {
    return [
      `<b>\ud83c\udf93 GRADUATED TOKENS</b>`,
      ``,
      `No graduated tokens yet. Check back soon!`,
    ].join("\n");
  }

  const lines = [
    `<b>\ud83c\udf93 GRADUATED TOKENS</b>`,
    ``,
    `Tokens that completed their bonding curve and are now trading on Uniswap.`,
    ``,
  ];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const mcStr = t.mcap > 0 ? `${fmtUsd(t.mcap)} MC` : "-- MC";
    const changeStr = t.priceChange24h ? `${fmtPct(t.priceChange24h)} 24h` : "";
    const holderStr = t.holders > 0 ? `${fmtNum(t.holders)} holders` : "";

    const parts = [mcStr, changeStr, holderStr].filter(Boolean);
    lines.push(`${i + 1}. <b>${esc(t.symbol)}</b> \u00b7 ${parts.join(" \u00b7 ")}`);
  }
  return lines.join("\n");
}

export function formatGraduatedButtons(tokens) {
  const buttons = tokens.slice(0, 5).map((t) => [
    { text: `${chainBadge(t)} ${t.symbol}`, url: tokenUrl(t) },
    { text: "\ud83e\udd84 DexScreener", url: dexScreenerUrl(t) },
  ]);
  buttons.push([{ text: "\ud83d\udd19 Menu", callback_data: "back_main" }]);
  return buttons;
}

// ─── Token detail ───────────────────────────────────────────────

export function formatTokenDetail(t) {
  const lines = [
    `\u2501\u2501\u2501 <b>${esc(t.symbol)}</b> \u00b7 ${esc(t.name)} \u2501\u2501\u2501`,
    ``,
    `\ud83d\udcb0 Price: <b>${fmtPrice(t.price)}</b>`,
    `\ud83d\udcca Market Cap: <b>${fmtUsd(t.mcap)}</b>`,
  ];
  if (t.liquidity > 0) lines.push(`\ud83d\udca7 Liquidity: <b>${fmtUsd(t.liquidity)}</b>`);
  lines.push(`\ud83d\udcc8 24h Change: <b>${fmtPct(t.priceChange24h)}</b>`);
  if (t.volume24h > 0) lines.push(`\ud83d\udcca Volume 24h: <b>${fmtUsd(t.volume24h)}</b>`);
  if (t.holders > 0) lines.push(`\ud83d\udc65 Holders: <b>${fmtNum(t.holders)}</b>`);

  if (t.status === "graduated") {
    lines.push(`\ud83c\udf93 Status: <b>Graduated (Uniswap V2)</b>`);
  } else {
    const bondStr = t.bondingProgress > 0 ? `Bonding ${Math.round(t.bondingProgress)}%` : "New";
    lines.push(`\ud83d\udfe3 Status: <b>${bondStr}</b>`);
    if (t.bondingProgress > 0) {
      lines.push(`   ${bondingBar(t.bondingProgress)}`);
    }
  }

  lines.push(``);
  lines.push(`\ud83d\udd17 Contract: <code>${shortAddr(t.address)}</code>`);
  if (t.createdAt) {
    const created = new Date(t.createdAt);
    const dateStr = created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const age = tokenAge(t);
    lines.push(`\ud83d\udcc5 Created: ${dateStr} (${age})`);
  }

  return lines.join("\n");
}

export function formatTokenButtons(t) {
  const rows = [
    [
      { text: "\ud83d\udcca Chart", url: tokenUrl(t) },
      { text: "\ud83d\udcb0 Buy on xpad", url: tokenUrl(t) },
    ],
  ];
  if (t.status === "graduated") {
    rows.push([
      { text: "\ud83d\udd0d Explorer", url: `${explorerUrl(t)}/token/${t.address}` },
      { text: "\ud83d\udcc8 DexScreener", url: dexScreenerUrl(t) },
    ]);
  } else {
    rows.push([
      { text: "\ud83d\udd0d Explorer", url: `${explorerUrl(t)}/token/${t.address}` },
    ]);
  }
  rows.push([{ text: "\ud83d\udd19 Back to Trending", callback_data: "menu_trending" }]);
  return rows;
}

// ─── Platform stats ─────────────────────────────────────────────

export function formatStats(stats, topToken, latestLaunch) {
  const lines = [
    `<b>\ud83d\udcca XPAD PLATFORM STATS</b>`,
    ``,
    `\ud83c\udfed Total Tokens: <b>${fmtNum(stats.totalTokens)}</b>`,
    `\ud83c\udf93 Graduated: <b>${fmtNum(stats.graduated)}</b>`,
  ];

  if (stats.totalMcap > 0) {
    lines.push(`\ud83d\udcb0 Total MC: <b>${fmtUsd(stats.totalMcap)}</b>`);
  }

  lines.push(`\ud83d\udcca 24h Volume: <b>${fmtUsd(stats.totalVolume24h)}</b>`);

  if (stats.totalHolders > 0) {
    lines.push(`\ud83d\udc65 Total Holders: <b>${fmtNum(stats.totalHolders)}</b>`);
  }

  if (topToken) {
    lines.push(``);
    lines.push(`\ud83c\udfc6 Top Token: <b>${esc(topToken.symbol)}</b> (${fmtUsd(topToken.mcap)} MC)`);
  }
  if (latestLaunch) {
    const age = tokenAge(latestLaunch);
    lines.push(`\ud83c\udd95 Latest Launch: <b>${esc(latestLaunch.symbol)}</b> (${age})`);
  }

  return lines.join("\n");
}

export function formatStatsButtons() {
  return [
    [
      { text: "\ud83d\udd25 Trending", callback_data: "menu_trending" },
      { text: "\ud83c\udd95 New Launches", callback_data: "menu_new" },
    ],
    [{ text: "\ud83d\udd19 Menu", callback_data: "back_main" }],
  ];
}

// ─── Alert settings ─────────────────────────────────────────────

export function formatAlertsSettings(alerts) {
  const on = "\u2705";
  const off = "\u274c";
  return [
    `<b>\ud83d\udd14 YOUR ALERTS</b>`,
    ``,
    `Toggle notifications:`,
    ``,
    `\ud83c\udd95 New Launches: ${alerts.launches ? on + " ON" : off + " OFF"}`,
    `\ud83c\udf93 Graduations: ${alerts.graduations ? on + " ON" : off + " OFF"}`,
    `\ud83d\udc0b Whale Buys (>0.1 ETH): ${alerts.bigBuys ? on + " ON" : off + " OFF"}`,
    `\ud83d\udd25 Trending Updates (2h): ${alerts.trending ? on + " ON" : off + " OFF"}`,
    ``,
    `Tap to toggle:`,
  ].join("\n");
}

export function alertsKeyboard(alerts) {
  return [
    [
      { text: `\ud83c\udd95 Launches ${alerts.launches ? "\u2705" : "\u274c"}`, callback_data: "alert_toggle_launches" },
      { text: `\ud83c\udf93 Graduations ${alerts.graduations ? "\u2705" : "\u274c"}`, callback_data: "alert_toggle_graduations" },
    ],
    [
      { text: `\ud83d\udc0b Whales ${alerts.bigBuys ? "\u2705" : "\u274c"}`, callback_data: "alert_toggle_bigBuys" },
      { text: `\ud83d\udd25 Trending ${alerts.trending ? "\u2705" : "\u274c"}`, callback_data: "alert_toggle_trending" },
    ],
    [{ text: "\ud83d\udd19 Menu", callback_data: "back_main" }],
  ];
}

// ─── Buy alert (compact, for groups) ────────────────────────────

export function formatBuyAlert(trade) {
  const { symbol, ethAmount, usdAmount, mcap, volume24h, graduated, bondingProgress } = trade;

  const ethStr = ethAmount < 0.001 ? ethAmount.toFixed(6) : ethAmount < 1 ? ethAmount.toFixed(4) : ethAmount.toFixed(3);
  const usdStr = fmtUsd(usdAmount);
  const mcapStr = mcap ? fmtUsd(mcap) : "N/A";
  const volStr = volume24h ? fmtUsd(volume24h) : "";

  // Green circles based on buy size
  const circleCount = Math.min(Math.max(Math.ceil(ethAmount * 10), 1), 10);
  const circles = "\ud83d\udfe2".repeat(circleCount);

  const lines = [
    `\ud83d\udfe2 <b>${usdStr} ${esc(symbol)} BUY</b>`,
    circles,
    ``,
    `\u27a1\ufe0f ${ethStr} ETH (${usdStr})`,
  ];

  if (!graduated && bondingProgress != null && bondingProgress > 0) {
    lines.push(`\ud83d\udcca MC: ${mcapStr} \u00b7 Bonding ${Math.round(bondingProgress)}%`);
  } else {
    const volPart = volStr ? ` \u00b7 Vol: ${volStr} 24h` : "";
    lines.push(`\ud83d\udcca MC: ${mcapStr}${volPart}`);
  }

  return lines.join("\n");
}

export function formatBuyAlertButtons(trade) {
  const chainKey = trade.chainKey || "ethereum";
  const path = chainKey === "base" ? "base" : "eth";
  const dexChain = chainKey === "base" ? "base" : "ethereum";
  return [
    [
      { text: "\ud83d\udcca xpad", url: `https://xpad.fun/${path}/${trade.tokenAddress}` },
      { text: "\ud83d\udcc8 DexScreener", url: `https://dexscreener.com/${dexChain}/${trade.tokenAddress}` },
    ],
  ];
}

// ─── Alert broadcasts ───────────────────────────────────────────

export function formatNewLaunchAlert(t) {
  return [
    `\ud83d\ude80 <b>NEW TOKEN LAUNCHED</b>`,
    ``,
    `<b>${esc(t.name)} ($${esc(t.symbol)})</b>`,
    t.mcap > 0 ? `\ud83d\udcb0 MC: ${fmtUsd(t.mcap)}` : "",
    ``,
    `<code>${t.address}</code>`,
  ].filter(Boolean).join("\n");
}

export function formatGraduationAlert(t) {
  return [
    `\ud83c\udf93 <b>TOKEN GRADUATED!</b>`,
    ``,
    `<b>${esc(t.name)} ($${esc(t.symbol)})</b>`,
    `\ud83d\udcb0 MC: ${fmtUsd(t.mcap)}`,
    t.holders > 0 ? `\ud83d\udc65 Holders: ${fmtNum(t.holders)}` : "",
    ``,
    `Now trading on Uniswap V2!`,
  ].filter(Boolean).join("\n");
}

export function formatTrendingAlert(tokens) {
  const lines = [
    `\ud83d\udd25 <b>TRENDING UPDATE</b>`,
    ``,
    `\u2501\u2501\u2501 TOP TOKENS \u2501\u2501\u2501`,
    ``,
  ];
  for (let i = 0; i < Math.min(5, tokens.length); i++) {
    const t = tokens[i];
    const mcStr = t.mcap > 0 ? fmtUsd(t.mcap) + " MC" : "";
    const changeStr = t.priceChange24h ? fmtPct(t.priceChange24h) : "";
    const parts = [mcStr, changeStr].filter(Boolean);
    lines.push(`${i + 1}. <b>${esc(t.symbol)}</b> \u00b7 ${parts.join(" \u00b7 ")}`);
  }
  return lines.join("\n");
}

// ─── Momentum update (every 2h to groups) ───────────────────────

export function formatMomentumUpdate(movers, topVolume, newLaunches) {
  const lines = [
    `\ud83d\udd25 <b>XPAD TRENDING UPDATE</b>`,
    ``,
  ];

  if (movers.length > 0) {
    lines.push(`\u2501\u2501\u2501 TOP MOVERS \u2501\u2501\u2501`);
    lines.push(``);
    for (const m of movers) {
      const dir = m.change >= 0 ? "\ud83d\udcc8" : "\ud83d\udcc9";
      const sign = m.change >= 0 ? "+" : "";
      const period = m.period || "1h";
      lines.push(`${dir} <b>${esc(m.symbol)}</b> ${sign}${Math.round(m.change)}% (${period}) \u00b7 ${fmtUsd(m.mcap)} MC`);
    }
    lines.push(``);
  }

  if (newLaunches.length > 0) {
    lines.push(`\u2501\u2501\u2501 NEW LAUNCHES \u2501\u2501\u2501`);
    lines.push(``);
    for (const n of newLaunches) {
      const pct = n.bondingProgress > 0 ? ` \u00b7 Bonding ${Math.round(n.bondingProgress)}%` : "";
      lines.push(`\ud83c\udd95 <b>${esc(n.symbol)}</b> just launched${pct}`);
    }
    lines.push(``);
  }

  if (topVolume) {
    lines.push(`\ud83c\udfc6 Top Volume: <b>${esc(topVolume.symbol)}</b> (${fmtUsd(topVolume.volume24h)} 24h)`);
  }

  return lines.join("\n");
}

// ─── Top Holders placeholder ────────────────────────────────────

export function formatTopHolders() {
  return [
    `<b>\ud83d\udc8e TOP HOLDERS</b>`,
    ``,
    `Coming soon! Top holders across all xpad tokens.`,
  ].join("\n");
}

// ─── Whale Alerts placeholder ───────────────────────────────────

export function formatWhaleAlerts() {
  return [
    `<b>\ud83d\udc0b WHALE ALERTS</b>`,
    ``,
    `Large buys (>0.1 ETH) are posted here automatically.`,
    ``,
    `Toggle whale alerts in your /alerts settings.`,
  ].join("\n");
}

// ─── Settings placeholder ───────────────────────────────────────

export function formatSettings() {
  return [
    `<b>\u2699\ufe0f SETTINGS</b>`,
    ``,
    `\ud83d\udd14 Alerts \u2014 Configure your notifications`,
    ``,
    `More settings coming soon.`,
  ].join("\n");
}

export function settingsKeyboard() {
  return [
    [{ text: "\ud83d\udd14 Alert Settings", callback_data: "menu_alerts" }],
    [{ text: "\ud83d\udd19 Menu", callback_data: "back_main" }],
  ];
}

// ─── Help text ──────────────────────────────────────────────────

export function formatHelp() {
  return [
    `<b>\ud83c\udfc6 XPAD TRENDING BOT \u2014 Help</b>`,
    ``,
    `\u2501\u2501\u2501 COMMANDS \u2501\u2501\u2501`,
    ``,
    `/start \u2014 Main menu`,
    `/trending \u2014 Top trending tokens`,
    `/new \u2014 Latest launches`,
    `/graduated \u2014 Graduated tokens`,
    `/token &lt;symbol&gt; \u2014 Token details`,
    `/stats \u2014 Platform stats`,
    `/alerts \u2014 Alert settings`,
    `/help \u2014 This message`,
    ``,
    `\u2501\u2501\u2501 FEATURES \u2501\u2501\u2501`,
    ``,
    `\ud83d\udce1 Auto buy alerts in groups`,
    `\ud83d\udd25 Trending updates every 2h`,
    `\ud83c\udf93 Graduation notifications`,
    `\ud83d\udc0b Whale buy alerts (>0.1 ETH)`,
  ].join("\n");
}

// ─── Loading state ──────────────────────────────────────────────

export function formatLoading(section) {
  return `\u23f3 Loading ${section || "data"}...`;
}

// ─── Helpers ────────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
