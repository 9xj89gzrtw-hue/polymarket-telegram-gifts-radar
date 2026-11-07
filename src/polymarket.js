/**
 * Polymarket reader — public Gamma API, no key, no wallet.
 *
 * Gamma returns every numeric field as a string and packs outcomes/prices into
 * JSON strings, so everything is normalised here before scoring.
 */
import { scoreMarket } from "./score.js";

const GAMMA = "https://gamma-api.polymarket.com";

async function getJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ApifyLiveRadar/1.0; +https://apify.com)",
        accept: "application/json"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeMarket(raw) {
  const outcomes = jsonArray(raw.outcomes);
  const prices = jsonArray(raw.outcomePrices).map((p) => num(p, 0));
  const liquidity = num(raw.liquidityNum ?? raw.liquidity, 0);
  const volume24h = num(raw.volume24hr ?? raw.volume24hrClob, 0);
  const spread = num(raw.spread, null);
  const momentum = num(raw.oneDayPriceChange ?? raw.oneHourPriceChange ?? raw.oneWeekPriceChange, 0);
  const sumPrices = prices.reduce((a, b) => a + b, 0);
  const overround = prices.length ? sumPrices - 1 : null;
  const scoring = scoreMarket({ liquidity, spread: spread ?? 0.05, momentum, volume24h, overround });

  const outcomeTable = outcomes.map((name, i) => ({
    outcome: name,
    price: prices[i] ?? null,
    implied_probability_pct: prices[i] === undefined ? null : Math.round(prices[i] * 1000) / 10
  }));

  return {
    _type: "market",
    source: "polymarket",
    market_id: raw.id || null,
    question: raw.question || "",
    slug: raw.slug || null,
    url: raw.slug ? `https://polymarket.com/event/${raw.slug}` : null,
    category: raw.category || null,
    end_date: raw.endDate || null,
    liquidity: round2(liquidity),
    volume_24h: round2(volume24h),
    volume_total: round2(num(raw.volume, 0)),
    spread: spread === null ? null : round4(spread),
    best_bid: num(raw.bestBid, null),
    best_ask: num(raw.bestAsk, null),
    last_trade_price: num(raw.lastTradePrice, null),
    momentum_24h: round4(momentum),
    outcomes: outcomeTable,
    overround: overround === null ? null : round4(overround),
    // Negative overround = buying every outcome costs less than $1.
    arbitrage_pct: overround === null ? null : round2(-overround * 100),
    score: scoring.score,
    score_components: scoring.components,
    signal: scoring.signal,
    reasons: buildReasons({ liquidity, spread, momentum, volume24h, overround }),
    checked_at: new Date().toISOString()
  };
}

function buildReasons({ liquidity, spread, momentum, volume24h, overround }) {
  const out = [];
  if (liquidity >= 100000) out.push("deep liquidity");
  else if (liquidity >= 10000) out.push("tradable liquidity");
  else out.push("thin liquidity");
  if (spread !== null && spread <= 0.01) out.push("tight spread");
  if (spread !== null && spread >= 0.05) out.push("wide spread");
  if (Math.abs(momentum) >= 0.1) out.push(`momentum ${momentum > 0 ? "+" : ""}${(momentum * 100).toFixed(1)}% in 24h`);
  if (volume24h >= 100000) out.push("high 24h volume");
  if (overround !== null && overround < -0.01) out.push("negative overround: all outcomes cost < $1");
  return out;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

/**
 * Fetch active markets ordered by liquidity, then filter client-side so the
 * caller gets exactly what the input asked for.
 */
export async function readMarkets({
  limit = 50,
  minLiquidity = 1000,
  minVolume24h = 0,
  minScore = 0,
  timeoutMs = 25000,
  order = "liquidity"
} = {}) {
  const pageSize = Math.min(500, Math.max(limit * 3, 100));
  const url = `${GAMMA}/markets?active=true&closed=false&limit=${pageSize}` +
    `&order=${encodeURIComponent(order)}&ascending=false&liquidity_num_min=${Math.max(0, minLiquidity)}`;
  let raw;
  try {
    raw = await getJson(url, timeoutMs);
  } catch (err) {
    return { ok: false, error: `Gamma API: ${err.message}`, markets: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Gamma API returned a non-array response", markets: [] };
  }

  const markets = raw
    .map(normalizeMarket)
    .filter((m) => m.liquidity >= minLiquidity)
    .filter((m) => m.volume_24h >= minVolume24h)
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || b.liquidity - a.liquidity)
    .slice(0, limit);

  return { ok: true, markets, fetched: raw.length };
}
