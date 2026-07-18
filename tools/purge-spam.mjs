#!/usr/bin/env node
// Purge the bot's own spam messages ("NEW TOKEN LAUNCHED" / "TOKEN GRADUATED")
// from a group. The Bot API has no getMessage, so each candidate message id is
// silently forwarded to a scratch DM to read its content and origin, the
// forward is deleted, and the original is deleted only when it is a bot spam
// message. Non-bot messages are never touched.
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... node tools/purge-spam.mjs \
//     --chat -100123456 --from 4210 [--to 4900] [--scratch 1407438598] [--dry]
//
// --from is the message id of the FIRST spam message (from its t.me/c/<id>/<N>
// link). Without --to, the current max id is discovered via a silent probe.

const args = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = arg("chat");
const FROM = parseInt(arg("from"), 10);
const TO = arg("to") ? parseInt(arg("to"), 10) : null;
const SCRATCH = arg("scratch", "1407438598"); // owner DM
const DRY = args.includes("--dry");
const BOT_ID = 8623962108; // @xpad_trending_bot

if (!TOKEN || !CHAT || !Number.isInteger(FROM)) {
  console.error("Required: TELEGRAM_BOT_TOKEN env, --chat, --from");
  process.exit(1);
}

const SPAM_PATTERNS = ["NEW TOKEN LAUNCHED", "TOKEN GRADUATED"];

async function api(method, params, { retries = 5 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (json.ok) return json.result;
    if (json.error_code === 429 && attempt < retries) {
      const wait = (json.parameters?.retry_after ?? 3) + 1;
      console.log(`  429, waiting ${wait}s...`);
      await sleep(wait * 1000);
      continue;
    }
    return { __error: json.description, __code: json.error_code };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let maxId = TO;
  if (!maxId) {
    const probe = await api("sendMessage", {
      chat_id: CHAT, text: "\u{1F9F9}", disable_notification: true,
    });
    if (probe.__error) {
      console.error(`Cannot post in ${CHAT}: ${probe.__error}`);
      process.exit(1);
    }
    maxId = probe.message_id;
    await api("deleteMessage", { chat_id: CHAT, message_id: maxId });
    console.log(`Current max message id: ${maxId}`);
  }

  console.log(`Scanning ${CHAT} ids ${FROM}..${maxId} (${maxId - FROM + 1} ids)${DRY ? " [DRY RUN]" : ""}`);
  let deleted = 0, kept = 0, missing = 0, failed = 0;

  for (let id = FROM; id <= maxId; id++) {
    const fwd = await api("forwardMessage", {
      chat_id: SCRATCH, from_chat_id: CHAT, message_id: id,
      disable_notification: true,
    });

    if (fwd.__error) {
      if (/not found|MESSAGE_ID_INVALID|can't be forwarded/i.test(fwd.__error)) missing++;
      else { failed++; console.log(`  fwd ${id} failed: ${fwd.__error}`); }
      await sleep(150);
      continue;
    }

    const origin = fwd.forward_origin;
    const fromBot = origin?.type === "user" && origin.sender_user?.id === BOT_ID;
    const text = fwd.text || fwd.caption || "";
    const isSpam = fromBot && SPAM_PATTERNS.some((p) => text.includes(p));

    await api("deleteMessage", { chat_id: SCRATCH, message_id: fwd.message_id });

    if (isSpam) {
      const label = text.split("\n").slice(0, 2).join(" | ").slice(0, 70);
      if (DRY) {
        console.log(`  WOULD DELETE ${id}: ${label}`);
        deleted++;
      } else {
        const del = await api("deleteMessage", { chat_id: CHAT, message_id: id });
        if (del.__error) { failed++; console.log(`  delete ${id} failed: ${del.__error}`); }
        else { deleted++; console.log(`  deleted ${id}: ${label}`); }
      }
    } else {
      kept++;
    }
    await sleep(350);
  }

  console.log(`\nDone. ${DRY ? "Would delete" : "Deleted"}: ${deleted}, kept: ${kept}, missing/gap: ${missing}, failed: ${failed}`);
})();
