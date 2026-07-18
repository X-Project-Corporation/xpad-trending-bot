import fs from "fs";
import path from "path";
import { DATA_DIR } from "./config.js";

const STORE_PATH = path.join(DATA_DIR, "store.json");
const BACKUP_PATH = path.join(DATA_DIR, "store.backup.json");

let data = { chats: {}, groups: {} };
let saveTimer = null;

// ─── Load / Save ─────────────────────────────────────────────────

export function load() {
  if (!tryLoad(STORE_PATH)) {
    console.warn("Main store failed, trying backup...");
    if (tryLoad(BACKUP_PATH)) save();
    else {
      console.warn("No store found, starting fresh.");
      data = { chats: {}, groups: {} };
    }
  }
  seedGroups();
}

// The data dir is on an ephemeral FS (wiped on every redeploy), which used to
// silently empty the broadcast list until an admin re-ran /start in each
// group. SEED_GROUPS (comma-separated chat ids) guarantees the core groups
// are always registered at boot.
function seedGroups() {
  const seeds = (process.env.SEED_GROUPS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of seeds) {
    if (!data.groups[id]) {
      data.groups[id] = { title: "seed", addedAt: new Date().toISOString() };
      console.log(`Group seeded from SEED_GROUPS: ${id}`);
    }
  }
  if (seeds.length) debouncedSave();
}

function tryLoad(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      const parsed = JSON.parse(fs.readFileSync(filepath, "utf-8"));
      if (parsed && parsed.chats) {
        data = parsed;
        if (!data.groups) data.groups = {};
        console.log(`Store loaded from ${path.basename(filepath)} (${Object.keys(data.chats).length} chats, ${Object.keys(data.groups).length} groups)`);
        return true;
      }
    }
  } catch (err) {
    console.error(`Failed to load ${filepath}:`, err.message);
  }
  return false;
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STORE_PATH)) {
      try { fs.copyFileSync(STORE_PATH, BACKUP_PATH); } catch {}
    }
    const tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.error("Failed to save store:", err.message);
  }
}

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 500);
}

// ─── Chat alert config (private chats + groups that toggle alerts) ──

function getChat(chatId) {
  const key = String(chatId);
  if (!data.chats[key]) {
    data.chats[key] = {
      alerts: {
        launches: true,
        graduations: true,
        bigBuys: false,
        trending: false,
      },
      addedAt: new Date().toISOString(),
    };
    debouncedSave();
  }
  return data.chats[key];
}

export function getAlerts(chatId) {
  return getChat(chatId).alerts;
}

export function toggleAlert(chatId, alertType) {
  const chat = getChat(chatId);
  chat.alerts[alertType] = !chat.alerts[alertType];
  debouncedSave();
  return chat.alerts[alertType];
}

/** Get all chat IDs that have a specific alert enabled. */
export function getChatsWithAlert(alertType) {
  const result = [];
  for (const [chatId, chat] of Object.entries(data.chats)) {
    if (chat.alerts && chat.alerts[alertType]) {
      result.push(chatId);
    }
  }
  return result;
}

/**
 * Read an alert flag WITHOUT creating/persisting a chat entry.
 * Returns `defaultVal` when the chat has no stored config for this alert.
 * Used so groups can receive default-ON alerts (launches/graduations) even
 * if nobody ever opened the /alerts menu in that group.
 */
export function isAlertEnabled(chatId, alertType, defaultVal = false) {
  const chat = data.chats[String(chatId)];
  if (!chat || !chat.alerts || chat.alerts[alertType] === undefined) return defaultVal;
  return !!chat.alerts[alertType];
}

export function removeChat(chatId) {
  delete data.chats[String(chatId)];
  debouncedSave();
}

// ─── Group tracking (for buy alerts broadcast) ───────────────────

/** Add a group to the broadcast list. */
export function addGroup(chatId, title) {
  const key = String(chatId);
  if (!data.groups[key]) {
    data.groups[key] = {
      title: title || "Unknown",
      addedAt: new Date().toISOString(),
    };
    debouncedSave();
    console.log(`Group added: ${key} (${title})`);
  } else {
    // Update title if changed
    if (title && data.groups[key].title !== title) {
      data.groups[key].title = title;
      debouncedSave();
    }
  }
}

/** Remove a group from the broadcast list. */
export function removeGroup(chatId) {
  const key = String(chatId);
  if (data.groups[key]) {
    delete data.groups[key];
    debouncedSave();
    console.log(`Group removed: ${key}`);
  }
  // Also remove from chats if present
  removeChat(chatId);
}

/** Get all group chat IDs for broadcasting. */
export function getAllGroups() {
  return Object.keys(data.groups);
}

/** Get group count. */
export function getGroupCount() {
  return Object.keys(data.groups).length;
}
