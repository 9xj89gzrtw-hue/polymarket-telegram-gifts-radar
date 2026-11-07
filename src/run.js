/**
 * One run = scan Polymarket and/or Telegram Gifts, score every candidate, push
 * the ranked list and append the paid-offer record.
 */
import { OFFER, offerLine, offerRecord } from "./offer.js";
import { readMarkets } from "./polymarket.js";
import { readGifts, tonUsd } from "./gifts.js";

export async function run(input = {}, push = async () => {}, { log = () => {} } = {}) {
  const mode = String(input.mode || "both").toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 50));
  const giftLimit = Math.max(1, Math.min(60, Number(input.giftLimit) || 15));
  const minLiquidity = Math.max(0, Number(input.minLiquidity) || 1000);
  const minVolume24h = Math.max(0, Number(input.minVolume24h) || 0);
  const minScore = Math.max(0, Math.min(100, Number(input.minScore) || 0));
  const timeoutMs = Math.max(5000, Math.min(120000, (Number(input.requestTimeoutSecs) || 25) * 1000));
  const includeOffer = input.includeOffer !== false;
  const giftCollections = Array.isArray(input.giftCollections)
    ? input.giftCollections.map(String).filter(Boolean)
    : [];

  const summary = {
    mode,
    markets: 0,
    gifts: 0,
    snipes: 0,
    watch: 0,
    failures: [],
    ton_usd: null,
    offer: offerLine()
  };

  if (mode === "polymarket" || mode === "both") {
    const result = await readMarkets({ limit, minLiquidity, minVolume24h, minScore, timeoutMs });
    if (!result.ok) {
      summary.failures.push({ source: "polymarket", error: result.error });
      log(`polymarket failed: ${result.error}`);
    } else {
      for (const market of result.markets) {
        summary.markets += 1;
        if (market.signal === "SNIPE") summary.snipes += 1;
        if (market.signal === "WATCH") summary.watch += 1;
        await push({ ...market, offer: offerLine() });
      }
      summary.markets_fetched = result.fetched;
    }
  }

  if (mode === "gifts" || mode === "both") {
    const [giftResult, rate] = await Promise.all([
      readGifts({ collections: giftCollections, limit: giftLimit, timeoutMs }),
      tonUsd(Math.min(timeoutMs, 15000))
    ]);
    summary.ton_usd = rate;
    if (!giftResult.ok) {
      summary.failures.push({ source: "telegram-gifts", error: giftResult.error || "no gifts parsed" });
      log(`gifts failed: ${giftResult.error || "no gifts parsed"}`);
    } else {
      for (const gift of giftResult.gifts) {
        summary.gifts += 1;
        if (gift.signal === "SNIPE") summary.snipes += 1;
        if (gift.signal === "WATCH") summary.watch += 1;
        const floorUsd = gift.floor_ton !== null && rate ? Math.round(gift.floor_ton * rate * 100) / 100 : null;
        const soldUsd = gift.sold_median_ton !== null && rate ? Math.round(gift.sold_median_ton * rate * 100) / 100 : null;
        await push({ ...gift, floor_usd: floorUsd, sold_median_usd: soldUsd, offer: offerLine() });
      }
      summary.gift_collections_scanned = giftResult.collections_scanned;
      if (giftResult.failures?.length) summary.failures.push(...giftResult.failures.map((f) => ({ source: "gift", ...f })));
    }
  }

  await push({ _type: "summary", ...summary });

  if (includeOffer) await push(offerRecord());

  return summary;
}
