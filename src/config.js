export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const XPAD_API_URL = process.env.XPAD_API_URL || "https://api.xpad.fun";
export const DATA_DIR = process.env.DATA_DIR || "./data";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}
