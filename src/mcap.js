/**
 * Hard ceiling on what the bot is allowed to TALK ABOUT.
 *
 * On 20 Jul 2026 the bot posted "TOP TOKENS: 1. cbBTC $6116.7M MC, 2. WETH $4481.4M MC,
 * 4. USDC $73277.2M MC" to every group. Those blue-chips had reached the in-memory token
 * cache back when /tokens still served source='discovered' rows, and that cache was never
 * evicted, so they kept being broadcast long after the API stopped returning them.
 *
 * The real fix is the reconcile in fetcher.js, which evicts anything the API no longer
 * returns. This cap is the fail-safe: it holds no matter which path a token arrives by.
 *
 * Deliberately dependency-free so it stays unit-testable without the bot's config (and
 * therefore without needing TELEGRAM_BOT_TOKEN just to assert a number comparison).
 *
 * TRADE-OFF worth revisiting: an xpad token that legitimately grows past the cap goes silent
 * instead of being celebrated. As of this writing the largest is ~$100K, so nothing real is
 * affected - but raise MAX_MCAP_USD, or scope the cap to non-xpad sources, before that changes.
 */
export const MAX_MCAP_USD = Number(process.env.MAX_MCAP_USD || 10_000_000);

export function withinMcapCap(t) {
  const mc = Number(t?.mcap);
  // An unknown or unparseable mcap is NOT treated as oversized: a fresh launch legitimately
  // has no mcap yet, and silencing new launches would be a worse failure than the one above.
  return !Number.isFinite(mc) || mc <= MAX_MCAP_USD;
}
