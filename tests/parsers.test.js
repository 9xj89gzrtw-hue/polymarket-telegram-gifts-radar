import test from "node:test";
import assert from "node:assert/strict";

import { clamp, scoreGift, scoreMarket } from "../src/score.js";
import { normalizeMarket } from "../src/polymarket.js";
import { parseCollections, parseGiftItems, summarizeCollection } from "../src/gifts.js";
import { offerLine, OFFER } from "../src/offer.js";

test("score: clamps and rewards deep liquid tight markets", () => {
  assert.equal(clamp(5, 0, 3), 3);
  const good = scoreMarket({ liquidity: 250000, spread: 0.005, momentum: 0.2, volume24h: 500000 });
  const bad = scoreMarket({ liquidity: 500, spread: 0.08, momentum: 0.001, volume24h: 50 });
  assert.ok(good.score > 80, `good=${good.score}`);
  assert.ok(bad.score < 20, `bad=${bad.score}`);
  assert.equal(good.signal, "SNIPE");
  assert.equal(bad.signal, "IGNORE");
});

test("polymarket: normalizes strings, outcomes and overround", () => {
  const raw = {
    id: "1",
    question: "Will X happen?",
    slug: "will-x-happen",
    liquidity: "120000.5",
    volume24hr: "45000",
    volume: "900000",
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.62","0.37"]',
    bestBid: "0.61",
    bestAsk: "0.62",
    spread: "0.01",
    oneDayPriceChange: "0.08",
    endDate: "2026-12-31T00:00:00Z"
  };
  const m = normalizeMarket(raw);
  assert.equal(m.liquidity, 120000.5);
  assert.equal(m.outcomes[0].implied_probability_pct, 62);
  assert.equal(m.overround, -0.01);
  assert.equal(m.arbitrage_pct, 1);
  assert.equal(m.momentum_24h, 0.08);
  assert.ok(m.score >= 60);
  assert.match(m.reasons.join(" "), /negative overround/);
});

test("gifts: parses Fragment collection list", () => {
  const html = `<a href="/gifts/plushpepe" class="tm-main-filters-item js-filter-item js-choose-collection-item" data-value="plushpepe">
    <div class="tm-main-filters-name">Plush Pepe</div><div class="tm-main-filters-count">12,345</div></a>
    <a href="/gifts/diamondring" class="tm-main-filters-item js-filter-item js-choose-collection-item" data-value="diamondring">
    <div class="tm-main-filters-name">Diamond Ring</div><div class="tm-main-filters-count">900</div></a>`;
  const list = parseCollections(html);
  assert.deepEqual(list.map((x) => x.slug), ["plushpepe", "diamondring"]);
  assert.equal(list[0].name, "Plush Pepe");
  assert.equal(list[0].listed, 12345);
});

test("gifts: parses prices, statuses and sold timestamps", () => {
  const html = `<a href="/gift/plushpepe-1" class="tm-grid-item">
    <div class="tm-grid-item-content"><div class="tm-grid-item-name"><span class="item-name">Plush Pepe</span><span class="item-num">&nbsp;#1</span></div>
    <div class="tm-grid-item-values"><div class="tm-grid-item-value tm-value icon-before icon-ton">1,200</div>
    <div class="tm-grid-item-status tm-status-unavail">Sold</div></div></div>
    <time datetime="2026-11-01T10:00:00+00:00"></time></a>
    <a href="/gift/plushpepe-2" class="tm-grid-item">
    <div class="tm-grid-item-values"><div class="tm-grid-item-value tm-value icon-before icon-ton">900</div>
    <div class="tm-grid-item-status tm-status-sale">For sale</div></div></a>`;
  const items = parseGiftItems(html, "plushpepe");
  assert.equal(items.length, 2);
  assert.equal(items[0].price_ton, 1200);
  assert.equal(items[0].status, "Sold");
  assert.equal(items[0].sold_at, "2026-11-01T10:00:00+00:00");
  assert.equal(items[1].status, "For sale");
});

test("gifts: floor below sold median earns a spread score", () => {
  const now = new Date().toISOString();
  const items = [];
  for (let i = 0; i < 40; i += 1) {
    items.push({ slug: `a-${i}`, collection: "a", number: i, price_ton: 800 + (i % 5), status: "For sale", sold_at: null, url: "" });
  }
  for (let i = 0; i < 20; i += 1) {
    items.push({ slug: `a-s${i}`, collection: "a", number: 100 + i, price_ton: 1000 + (i % 3) * 50, status: "Sold", sold_at: now, url: "" });
  }
  const s = summarizeCollection({ slug: "a", name: "A" }, items);
  assert.equal(s.floor_ton, 800);
  assert.equal(s.sold_median_ton, 1050);
  assert.ok(s.spread_pct < -20);
  assert.ok(s.score >= 50, `score=${s.score}`);
  assert.ok(["SNIPE", "WATCH"].includes(s.signal));
});

test("offer: points at Live Radar Pro", () => {
  assert.equal(OFFER.code, "TW1-RADAR");
  assert.equal(OFFER.priceRub, 390);
  const line = offerLine();
  assert.match(line, /TW1-RADAR/);
  assert.match(line, /390 RUB/);
  assert.match(line, /plati\.market\/itm\/6358155/);
});
