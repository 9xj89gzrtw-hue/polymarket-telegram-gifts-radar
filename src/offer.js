/**
 * Single source of truth for the paid offer.
 */
export const OFFER = {
  product: "Live Radar Pro — Polymarket + Telegram Gifts scanner with alerts and CSV export",
  code: "TW1-RADAR",
  priceRub: 390,
  priceUsdc: 14,
  storeUrl: "https://9xj89gzrtw-hue.github.io/live-radar/",
  checkoutUrl: "https://oplata.info/asp2/pay_wm.asp?id_d=6358155&ai=1481449&lang=ru-RU",
  platiUrl: "https://plati.market/itm/6358155",
  platiLotId: 6358155,
  seller: "danilaonly (Plati.Market ID 1481449)",
  delivery: "Instant TW1-RADAR-… key on the order page right after SBP / RU card payment.",
  freeFeatures: [
    "top Polymarket markets by liquidity with score, spread and 24h momentum",
    "Telegram Gifts floor vs recent-sold median for the top collections",
    "SNIPE / WATCH / IGNORE flags with the exact reasons",
    "JSON/CSV export of this run from the Apify dataset"
  ],
  paidFeatures: [
    "Live Radar Pro dashboard: both markets in one window, auto-refresh",
    "custom watchlists, score thresholds and Telegram alerts",
    "full CSV/XLSX history and price-change tracking between runs",
    "gift collection deep-dive: every listing, rarity and spread",
    "lifetime key, no subscription"
  ]
};

export function offerLine() {
  return (
    `Free scanner here: top markets + gift floors with SNIPE/WATCH flags. ` +
    `Live Radar Pro dashboard, alerts and full history (${OFFER.code}, ${OFFER.priceRub} RUB / $${OFFER.priceUsdc} USDC): ${OFFER.storeUrl} ` +
    `| Plati.Market: ${OFFER.platiUrl}`
  );
}

export function offerRecord() {
  return {
    _type: "offer",
    product: OFFER.product,
    code: OFFER.code,
    price_rub: OFFER.priceRub,
    price_usdc: OFFER.priceUsdc,
    store_url: OFFER.storeUrl,
    checkout_url: OFFER.checkoutUrl,
    plati_url: OFFER.platiUrl,
    delivery: OFFER.delivery,
    free: OFFER.freeFeatures,
    paid: OFFER.paidFeatures,
    note: offerLine()
  };
}
