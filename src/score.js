/**
 * Scoring model shared by Polymarket markets and Telegram gift collections.
 *
 * The score is intentionally simple and explainable: liquidity (can I get in
 * and out?), spread (what does it cost?), momentum (is the crowd moving?) and
 * volume (is anybody trading?). Every component is returned with the score so
 * a user can see *why* something was flagged instead of trusting a black box.
 */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function liquidityPoints(liquidity, max = 40) {
  // 100 -> 0, 100k -> 40 (log scale)
  const v = Math.max(0, Number(liquidity) || 0);
  return max * clamp(Math.log10(Math.max(v, 1) / 100) / 3, 0, 1);
}

export function spreadPoints(spread, max = 30, badSpread = 0.1) {
  // 0 -> full points, 10 cents -> 0
  const v = Math.max(0, Number(spread) || 0);
  return max * (1 - clamp(v / badSpread, 0, 1));
}

export function momentumPoints(momentum, max = 20, strongMove = 0.15) {
  const v = Math.abs(Number(momentum) || 0);
  return max * clamp(v / strongMove, 0, 1);
}

export function volumePoints(volume24h, max = 10) {
  const v = Math.max(0, Number(volume24h) || 0);
  return max * clamp(Math.log10(Math.max(v, 1) / 1000) / 2, 0, 1);
}

export function scoreMarket({ liquidity, spread, momentum, volume24h, overround = null }) {
  const components = {
    liquidity: round(liquidityPoints(liquidity)),
    spread: round(spreadPoints(spread)),
    momentum: round(momentumPoints(momentum)),
    volume: round(volumePoints(volume24h))
  };
  const score = Math.round(components.liquidity + components.spread + components.momentum + components.volume);
  // A deep, tight market is "good", not automatically a "snipe". A signal
  // needs a catalyst: a sharp move or a negative overround (all outcomes < $1).
  const catalyst = Math.abs(Number(momentum) || 0) >= 0.15
    || (overround !== null && Number(overround) <= -0.01);
  return {
    score,
    components,
    catalyst,
    signal: score >= 70 && catalyst ? "SNIPE" : score >= 50 ? "WATCH" : "IGNORE"
  };
}

/**
 * Gift spread: a negative spread means the current floor ask is *below* the
 * median of recent sold listings — the classic "underpriced floor" setup.
 * `soldMedian` is the reference, `floor` the current cheapest ask.
 */
export function scoreGift({ floor, soldMedian, activeListings, soldCount, momentum }) {
  const spreadPct = soldMedian > 0 ? ((floor - soldMedian) / soldMedian) * 100 : null;
  const liquidity = Math.min(40, Math.log10(Math.max(activeListings + soldCount, 1) + 1) * 16);
  const spread = spreadPct === null ? 0 : clamp(-spreadPct, 0, 40); // -40% -> 40 points
  const mom = clamp(Math.abs(Number(momentum) || 0) * 100, 0, 20);
  const score = Math.round(clamp(liquidity, 0, 40) + spread + mom);
  return {
    score,
    spreadPct: spreadPct === null ? null : round(spreadPct),
    components: {
      liquidity: round(clamp(liquidity, 0, 40)),
      spread: round(spread),
      momentum: round(mom)
    },
    signal: score >= 70 && (spreadPct === null || spreadPct <= -10) ? "SNIPE"
      : score >= 50 ? "WATCH" : "IGNORE"
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
