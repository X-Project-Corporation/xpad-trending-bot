import TelegramBot from "node-telegram-bot-api";
import { TELEGRAM_BOT_TOKEN } from "./config.js";
import { getAlerts, toggleAlert, getChatsWithAlert, removeChat, addGroup, removeGroup, getAllGroups } from "./store.js";
import {
  getTrending,
  getNewTokens,
  getGraduatedTokens,
  getToken,
  getPlatformStats,
  getSnapshots,
  getAllTokens,
  setCallbacks,
} from "./fetcher.js";
import {
  formatTrendingList,
  formatTrendingButtons,
  formatNewList,
  formatGraduatedList,
  formatTokenDetail,
  formatTokenButtons,
  formatStats,
  formatAlertsSettings,
  alertsKeyboard,
  formatNewLaunchAlert,
  formatGraduationAlert,
  formatTrendingAlert,
  formatBuyAlert,
  formatMomentumUpdate,
  formatHelp,
} from "./formatter.js";
import { startListener, getEthPrice } from "./listener.js";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ─── Anti-spam: rate limit per group ────────────────────────────

const lastSendTime = new Map(); // chatId -> timestamp
const MIN_SEND_INTERVAL = 5000; // 5s between messages per group

function canSendToGroup(chatId) {
  const now = Date.now();
  const last = lastSendTime.get(chatId) || 0;
  if (now - last < MIN_SEND_INTERVAL) return false;
  lastSendTime.set(chatId, now);
  return true;
}

// ─── Queue for group broadcasts (prevents flooding) ─────────────

const sendQueue = [];
let queueProcessing = false;

function enqueueSend(chatId, text, opts) {
  sendQueue.push({ chatId, text, opts });
  if (!queueProcessing) processQueue();
}

async function processQueue() {
  queueProcessing = true;
  while (sendQueue.length > 0) {
    const { chatId, text, opts } = sendQueue.shift();
    if (!canSendToGroup(chatId)) {
      // Re-queue with a small delay
      sendQueue.unshift({ chatId, text, opts });
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    try {
      await bot.sendMessage(chatId, text, opts);
    } catch (err) {
      handleSendError(chatId, err);
    }
  }
  queueProcessing = false;
}

// ─── Error handling for sends ───────────────────────────────────

function handleSendError(chatId, err) {
  const code = err?.response?.statusCode;
  const desc = err?.response?.body?.description || err.message || "";
  if (code === 403 || desc.includes("kicked") || desc.includes("blocked") || desc.includes("deactivated")) {
    removeGroup(chatId);
    removeChat(chatId);
    console.log(`Removed dead chat ${chatId}: ${desc.slice(0, 60)}`);
  } else {
    console.error(`Send error to ${chatId}: ${desc.slice(0, 80)}`);
  }
}

function safeSend(chatId, text, opts) {
  bot.sendMessage(chatId, text, opts).catch((err) => {
    handleSendError(chatId, err);
  });
}

// ─── Group tracking: my_chat_member ─────────────────────────────

bot.on("my_chat_member", (update) => {
  const chat = update.chat;
  const newStatus = update.new_chat_member?.status;
  const chatType = chat.type;

  // Only track groups/supergroups
  if (chatType !== "group" && chatType !== "supergroup") return;

  if (newStatus === "member" || newStatus === "administrator") {
    addGroup(chat.id, chat.title);
    console.log(`Bot added to group: ${chat.title} (${chat.id})`);
  } else if (newStatus === "left" || newStatus === "kicked") {
    removeGroup(chat.id);
    console.log(`Bot removed from group: ${chat.title} (${chat.id})`);
  }
});

// ─── Main menu ───────────────────────────────────────────────────

const MAIN_MENU = {
  inline_keyboard: [
    [
      { text: "\ud83d\udd25 Trending", callback_data: "menu_trending" },
      { text: "\ud83c\udd95 New Launches", callback_data: "menu_new" },
    ],
    [
      { text: "\ud83c\udf93 Graduated", callback_data: "menu_graduated" },
      { text: "\ud83d\udcca Stats", callback_data: "menu_stats" },
    ],
    [{ text: "\ud83d\udd14 Alerts", callback_data: "menu_alerts" }],
  ],
};

function mainMenuText() {
  return [
    "<b>\ud83d\udc7b xpad Trending Bot</b>",
    "",
    "Track every token on xpad.fun \u2014 trending, new launches, graduations, and alerts.",
    "",
    "Choose an option:",
  ].join("\n");
}

// ─── /start & /menu ─────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  // Auto-register group when someone uses /start
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    addGroup(msg.chat.id, msg.chat.title);
  }
  bot.sendMessage(msg.chat.id, mainMenuText(), {
    parse_mode: "HTML",
    reply_markup: MAIN_MENU,
    disable_web_page_preview: true,
  });
});

bot.onText(/\/menu/, (msg) => {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    addGroup(msg.chat.id, msg.chat.title);
  }
  bot.sendMessage(msg.chat.id, mainMenuText(), {
    parse_mode: "HTML",
    reply_markup: MAIN_MENU,
    disable_web_page_preview: true,
  });
});

// ─── /help ──────────────────────────────────────────────────────

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, formatHelp(), {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
});

// ─── /trending ───────────────────────────────────────────────────

bot.onText(/\/trending/, (msg) => sendTrending(msg.chat.id));

function sendTrending(chatId, editMessageId) {
  const tokens = getTrending(10);
  const text = formatTrendingList(tokens);
  const buttons = formatTrendingButtons(tokens);
  buttons.push([{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }]);

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true };
  if (editMessageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ─── /new ────────────────────────────────────────────────────────

bot.onText(/\/new/, (msg) => sendNew(msg.chat.id));

function sendNew(chatId, editMessageId) {
  const tokens = getNewTokens(10);
  const text = formatNewList(tokens);
  const buttons = tokens.map((t) => [
    { text: `\ud83d\udcc8 ${t.symbol}`, url: `https://xpad.fun/token/${t.address}` },
    { text: "\ud83d\udcb0 Buy", url: `https://xpad.fun/token/${t.address}` },
  ]);
  buttons.push([{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }]);

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true };
  if (editMessageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ─── /graduated ──────────────────────────────────────────────────

bot.onText(/\/graduated/, (msg) => sendGraduated(msg.chat.id));

function sendGraduated(chatId, editMessageId) {
  const tokens = getGraduatedTokens(10);
  const text = formatGraduatedList(tokens);
  const buttons = tokens.map((t) => [
    { text: `\ud83d\udcc8 ${t.symbol}`, url: `https://xpad.fun/token/${t.address}` },
    { text: "\ud83e\udd84 DexScreener", url: `https://dexscreener.com/ethereum/${t.pairAddress || t.address}` },
  ]);
  buttons.push([{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }]);

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true };
  if (editMessageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ─── /token <address|symbol> ─────────────────────────────────────

bot.onText(/\/token\s+(.+)/, (msg, match) => {
  const query = match[1].trim();
  sendTokenDetail(msg.chat.id, query);
});

function sendTokenDetail(chatId, query, editMessageId) {
  const token = getToken(query);
  if (!token) {
    const text = "Token not found. Try an address or symbol.";
    if (editMessageId) {
      bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId }).catch(() => {});
    } else {
      bot.sendMessage(chatId, text);
    }
    return;
  }
  const text = formatTokenDetail(token);
  const buttons = formatTokenButtons(token);
  buttons.push([{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }]);

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true };
  if (editMessageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ─── /alerts ─────────────────────────────────────────────────────

bot.onText(/\/alerts/, (msg) => sendAlerts(msg.chat.id));

function sendAlerts(chatId, editMessageId) {
  const alerts = getAlerts(chatId);
  const text = formatAlertsSettings(alerts);
  const kb = alertsKeyboard(alerts);

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: kb }, disable_web_page_preview: true };
  if (editMessageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ─── /stats ──────────────────────────────────────────────────────

bot.onText(/\/stats/, (msg) => sendStats(msg.chat.id));

function sendStats(chatId, editMessageId) {
  const stats = getPlatformStats();
  const text = formatStats(stats);
  const buttons = [[{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }]];

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons }, disable_web_page_preview: true };
  if (editMessageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, ...opts }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, opts);
  }
}

// ─── Callback query handler ─────────────────────────────────────

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === "back_main") {
    bot.editMessageText(mainMenuText(), {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "HTML",
      reply_markup: MAIN_MENU,
    }).catch(() => {});
    return;
  }

  if (data === "menu_trending") { sendTrending(chatId, msgId); return; }
  if (data === "menu_new") { sendNew(chatId, msgId); return; }
  if (data === "menu_graduated") { sendGraduated(chatId, msgId); return; }
  if (data === "menu_stats") { sendStats(chatId, msgId); return; }
  if (data === "menu_alerts") { sendAlerts(chatId, msgId); return; }

  // Alert toggles
  if (data.startsWith("alert_toggle_")) {
    const alertType = data.replace("alert_toggle_", "");
    toggleAlert(chatId, alertType);
    sendAlerts(chatId, msgId);
    return;
  }
});

// ─── Buy alert broadcasts (from blockchain listener) ────────────

function broadcastBuyAlert(trade) {
  const groups = getAllGroups();
  if (!groups.length) return;

  const text = formatBuyAlert(trade);
  const kb = [
    [
      { text: "\ud83d\udcc8 xpad", url: `https://xpad.fun/token/${trade.tokenAddress}` },
      { text: "\ud83d\udcca DexScreener", url: `https://dexscreener.com/ethereum/${trade.tokenAddress}` },
    ],
  ];
  const opts = {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: kb },
    disable_web_page_preview: true,
  };

  for (const chatId of groups) {
    enqueueSend(chatId, text, opts);
  }

  // Also send to private chats with bigBuys alert enabled (>0.1 ETH)
  if (trade.ethAmount >= 0.1) {
    const bigBuyChats = getChatsWithAlert("bigBuys");
    for (const chatId of bigBuyChats) {
      // Don't double-send to groups
      if (!groups.includes(chatId)) {
        enqueueSend(chatId, text, opts);
      }
    }
  }
}

// ─── Auto-alerts: new launches & graduations ────────────────────

function broadcastNewLaunch(token) {
  const chatIds = getChatsWithAlert("launches");
  if (!chatIds.length) return;
  const text = formatNewLaunchAlert(token);
  const kb = [
    [
      { text: "\ud83d\udcc8 View", url: `https://xpad.fun/token/${token.address}` },
      { text: "\ud83d\udcb0 Buy", url: `https://xpad.fun/token/${token.address}` },
    ],
  ];
  for (const chatId of chatIds) {
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: kb }, disable_web_page_preview: true });
  }
}

function broadcastGraduation(token) {
  const chatIds = getChatsWithAlert("graduations");
  if (!chatIds.length) return;
  const text = formatGraduationAlert(token);
  const kb = [
    [
      { text: "\ud83d\udcc8 Chart", url: `https://xpad.fun/token/${token.address}` },
      { text: "\ud83e\udd84 DexScreener", url: `https://dexscreener.com/ethereum/${token.pairAddress || token.address}` },
    ],
  ];
  for (const chatId of chatIds) {
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: kb }, disable_web_page_preview: true });
  }
}

// ─── Trending broadcast (every 4h to alert subscribers) ─────────

function broadcastTrending() {
  const chatIds = getChatsWithAlert("trending");
  if (!chatIds.length) return;
  const tokens = getTrending(5);
  if (!tokens.length) return;
  const text = formatTrendingAlert(tokens);
  const kb = tokens.slice(0, 3).map((t) => [
    { text: `\ud83d\udcc8 ${t.symbol}`, url: `https://xpad.fun/token/${t.address}` },
  ]);
  for (const chatId of chatIds) {
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: kb }, disable_web_page_preview: true });
  }
}

// Run trending broadcast every 4 hours
setInterval(broadcastTrending, 4 * 60 * 60_000);

// ─── Momentum update (every 2h to all groups) ───────────────────

function broadcastMomentumUpdate() {
  const groups = getAllGroups();
  if (!groups.length) return;

  const allTokens = getAllTokens();
  if (!allTokens.length) return;

  // Find tokens with >10% move in 1h using snapshots
  const movers = [];
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const twentyFourHoursAgo = now - 24 * 3_600_000;

  for (const token of allTokens) {
    const snaps = getSnapshots(token.address);
    if (!snaps.length) continue;

    // Find snapshot closest to 1h ago
    let snap1h = null;
    for (const s of snaps) {
      if (s.ts <= oneHourAgo) snap1h = s;
    }

    if (snap1h && snap1h.price > 0 && token.price > 0) {
      const change1h = ((token.price - snap1h.price) / snap1h.price) * 100;
      if (Math.abs(change1h) >= 10) {
        movers.push({ symbol: token.symbol, change: change1h, mcap: token.mcap, period: "1h" });
      }
    }

    // Check 24h movers with >50% move
    if (token.priceChange24h && Math.abs(token.priceChange24h) >= 50) {
      // Don't duplicate if already in 1h movers
      if (!movers.find((m) => m.symbol === token.symbol)) {
        movers.push({ symbol: token.symbol, change: token.priceChange24h, mcap: token.mcap, period: "24h" });
      }
    }
  }

  // Find new launches in last 2 hours
  const twoHoursAgo = now - 2 * 3_600_000;
  const newLaunches = allTokens.filter((t) => {
    if (!t.createdAt) return false;
    return new Date(t.createdAt).getTime() >= twoHoursAgo;
  }).slice(0, 3);

  // Find top volume token
  const topVolume = allTokens.reduce((best, t) => {
    if ((t.volume24h || 0) > (best?.volume24h || 0)) return t;
    return best;
  }, null);

  // Only post if there's something interesting
  if (movers.length === 0 && newLaunches.length === 0) return;

  // Sort movers by absolute change
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const topMovers = movers.slice(0, 5);

  const text = formatMomentumUpdate(topMovers, topVolume, newLaunches);

  for (const chatId of groups) {
    enqueueSend(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
  }

  // Also send to trending alert subscribers
  const trendingChats = getChatsWithAlert("trending");
  for (const chatId of trendingChats) {
    if (!groups.includes(chatId)) {
      safeSend(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });
    }
  }
}

// Run momentum update every 2 hours
setInterval(broadcastMomentumUpdate, 2 * 60 * 60_000);

// ─── Wire up fetcher callbacks ───────────────────────────────────

setCallbacks({
  onNewLaunch: broadcastNewLaunch,
  onGraduation: broadcastGraduation,
});

// ─── Start blockchain listener ──────────────────────────────────

startListener(broadcastBuyAlert);

// ─── Handle polling errors gracefully ────────────────────────────

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

export { bot };
