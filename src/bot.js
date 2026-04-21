import TelegramBot from "node-telegram-bot-api";
import { TELEGRAM_BOT_TOKEN } from "./config.js";
import { getAlerts, toggleAlert, getChatsWithAlert, removeChat } from "./store.js";
import {
  getTrending,
  getNewTokens,
  getGraduatedTokens,
  getToken,
  getPlatformStats,
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
} from "./formatter.js";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

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

// ─── /start ──────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, mainMenuText(), {
    parse_mode: "HTML",
    reply_markup: MAIN_MENU,
  });
});

// ─── /trending ───────────────────────────────────────────────────

bot.onText(/\/trending/, (msg) => sendTrending(msg.chat.id));

function sendTrending(chatId, editMessageId) {
  const tokens = getTrending(10);
  const text = formatTrendingList(tokens);
  const buttons = formatTrendingButtons(tokens);
  buttons.push([{ text: "\u25c0\ufe0f Back", callback_data: "back_main" }]);

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
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

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
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

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
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

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
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

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: kb } };
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

  const opts = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };
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

// ─── Auto-alerts: broadcasts ─────────────────────────────────────

function safeSend(chatId, text, opts) {
  bot.sendMessage(chatId, text, opts).catch((err) => {
    // Bot was blocked or kicked — remove chat
    if (err?.response?.statusCode === 403) {
      removeChat(chatId);
      console.log(`Removed blocked chat ${chatId}`);
    }
  });
}

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
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: kb } });
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
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: kb } });
  }
}

// ─── Trending broadcast (every 4h) ──────────────────────────────

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
    safeSend(chatId, text, { parse_mode: "HTML", reply_markup: { inline_keyboard: kb } });
  }
}

// Run trending broadcast every 4 hours
setInterval(broadcastTrending, 4 * 60 * 60_000);

// ─── Wire up fetcher callbacks ───────────────────────────────────

setCallbacks({
  onNewLaunch: broadcastNewLaunch,
  onGraduation: broadcastGraduation,
});

// ─── Handle polling errors gracefully ────────────────────────────

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

export { bot };
