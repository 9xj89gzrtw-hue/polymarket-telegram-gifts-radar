/**
 * Telegram Gifts reader — Fragment's public catalogue pages.
 *
 * Fragment renders each collection as a server-side grid: item number, price
 * in TON, status ("For sale" / "Sold" / "Not for sale") and, for sold items, a
 * timestamp. That is enough to compute a floor ask, a recent-sold median and a
 * spread without any private API or wallet.
 */
import { scoreGift } from "./score.js";

const FRAGMENT = "https://fragment.com";

async function getText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseTon(value) {
  const n = Number(String(value || "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Collection list from https://fragment.com/gifts */
export function parseCollections(html) {
  const out = [];
  const re = /<a\b[^>]*href="\/gifts\/([^"?#]+)"[^>]*class="[^"]*js-choose-collection-item[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1];
    const body = m[2];
    const name = (body.match(/class="tm-main-filters-name">([\s\S]*?)<\/div>/i) || [])[1] || slug;
    const count = (body.match(/class="tm-main-filters-count">([\s\S]*?)<\/div>/i) || [])[1] || "";
    out.push({
      slug,
      name: name.replace(/<[^>]+>/g, "").trim(),
      listed: Number(String(count).replace(/[^\d]/g, "")) || null
    });
  }
  return dedupe(out);
}

/** Items on a collection page. */
export function parseGiftItems(html, collection) {
  const items = [];
  const re = /<a\b[^>]*href="\/gift\/([^"]+)"[^>]*class="tm-grid-item"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1];
    const body = m[2];
    const price = parseTon((body.match(/icon-ton">([\d,.]+)<\/div>/i) || [])[1]);
    const status = ((body.match(/class="tm-grid-item-status[^"]*">([^<]+)<\/div>/i) || [])[1] || "").trim();
    const datetime = (body.match(/<time\b[^>]*datetime="([^"]+)"/i) || [])[1] || null;
    const num = (body.match(/class="item-num">[^#]*#([\d]+)/i) || [])[1] || (slug.match(/-(\d+)$/) || [])[1] || null;
    if (price === null) continue;
    items.push({
      slug,
      collection,
      number: num ? Number(num) : null,
      price_ton: price,
      status,
      sold_at: status.toLowerCase() === "sold" ? datetime : null,
      url: `${FRAGMENT}/gift/${slug}`
    });
  }
  return items;
}

export function summarizeCollection(collection, items, { recentDays = 30 } = {}) {
  const forSale = items.filter((i) => i.status.toLowerCase() === "for sale");
  const sold = items.filter((i) => i.status.toLowerCase() === "sold" && i.sold_at);
  const floor = forSale.length ? Math.min(...forSale.map((i) => i.price_ton)) : null;
  const cutoff = Date.now() - recentDays * 86400000;
  const recentSold = sold.filter((i) => {
    const t = Date.parse(i.sold_at);
    return Number.isFinite(t) && t >= cutoff;
  });
  const soldSample = recentSold.length >= 2 ? recentSold : sold;
  const soldPrices = soldSample.map((i) => i.price_ton).sort((a, b) => a - b);
  const soldMedian = median(soldPrices);

  // Momentum: last half of sold sample vs the earlier half (by date).
  const byDate = [...soldSample].sort((a, b) => Date.parse(a.sold_at) - Date.parse(b.sold_at));
  const half = Math.floor(byDate.length / 2);
  const older = median(byDate.slice(0, half).map((i) => i.price_ton));
  const newer = median(byDate.slice(half).map((i) => i.price_ton));
  const momentum = older && newer ? (newer - older) / older : 0;

  const scoring = scoreGift({
    floor: floor ?? soldMedian ?? 0,
    soldMedian: soldMedian ?? 0,
    activeListings: forSale.length,
    soldCount: sold.length,
    momentum
  });

  return {
    _type: "gift",
    source: "telegram-gifts",
    collection: collection.name || collection.slug,
    collection_slug: collection.slug,
    url: `${FRAGMENT}/gifts/${collection.slug}`,
    floor_ton: floor,
    sold_median_ton: soldMedian,
    sold_sample_size: soldPrices.length,
    spread_pct: scoring.spreadPct,
    momentum: Math.round(momentum * 10000) / 10000,
    active_listings: forSale.length,
    sold_listings: sold.length,
    last_sale_at: sold.length ? sold.map((i) => i.sold_at).sort().at(-1) : null,
    score: scoring.score,
    score_components: scoring.components,
    signal: scoring.signal,
    reasons: buildReasons({ floor, soldMedian, forSale: forSale.length, sold: sold.length, spreadPct: scoring.spreadPct }),
    checked_at: new Date().toISOString()
  };
}

function buildReasons({ floor, soldMedian, forSale, sold, spreadPct }) {
  const out = [];
  if (floor === null) out.push("no active asks in the visible sample");
  if (floor !== null && soldMedian !== null) {
    if (spreadPct <= -10) out.push(`floor ${Math.abs(spreadPct).toFixed(1)}% below recent sold median`);
    else if (spreadPct >= 10) out.push(`floor ${spreadPct.toFixed(1)}% above recent sold median`);
    else out.push("floor in line with recent sales");
  }
  out.push(`${forSale} for sale, ${sold} sold in the visible sample`);
  if (forSale <= 3) out.push("thin ask side");
  return out;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => {
    if (seen.has(x.slug)) return false;
    seen.add(x.slug);
    return true;
  });
}

function dedupeItems(list) {
  const seen = new Set();
  return list.filter((x) => {
    if (seen.has(x.slug)) return false;
    seen.add(x.slug);
    return true;
  });
}

export async function readGifts({ collections = [], limit = 20, timeoutMs = 25000 } = {}) {
  let selected = collections.filter(Boolean);
  if (!selected.length) {
    let html;
    try {
      html = await getText(`${FRAGMENT}/gifts`, timeoutMs);
    } catch (err) {
      return { ok: false, error: `Fragment: ${err.message}`, gifts: [] };
    }
    selected = parseCollections(html)
      .sort((a, b) => (b.listed || 0) - (a.listed || 0))
      .slice(0, limit)
      .map((c) => c.slug);
  } else {
    selected = selected.slice(0, limit);
  }

  const gifts = [];
  const failures = [];
  for (const slug of selected) {
    try {
      const base = `${FRAGMENT}/gifts/${encodeURIComponent(slug)}`;
      const [saleHtml, soldHtml] = await Promise.all([
        getText(`${base}?filter=sale&sort=price_asc`, timeoutMs).catch(() => ""),
        getText(`${base}?filter=sold&sort=listed`, timeoutMs).catch(() => "")
      ]);
      const items = dedupeItems([
        ...parseGiftItems(saleHtml, slug),
        ...parseGiftItems(soldHtml, slug)
      ]);
      if (!items.length) {
        failures.push({ collection: slug, error: "no gift items parsed" });
        continue;
      }
      gifts.push(summarizeCollection({ slug, name: slug }, items));
    } catch (err) {
      failures.push({ collection: slug, error: err.message });
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  gifts.sort((a, b) => b.score - a.score);
  return { ok: gifts.length > 0, gifts, failures, collections_scanned: selected.length };
}

export async function tonUsd(timeoutMs = 15000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch("https://tonapi.io/v2/rates?tokens=ton&currencies=usd", { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    const price = data?.rates?.TON?.prices?.USD;
    return Number.isFinite(Number(price)) ? Number(price) : null;
  } catch {
    return null;
  }
}
