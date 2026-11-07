# Polymarket & Telegram Gifts Arbitrage Scanner — Spread, Momentum, SNIPE

**One run scans live Polymarket markets and Telegram Gifts floors, computes liquidity, spread, 24-hour momentum and overround, then ranks everything with a transparent 0–100 score and a `SNIPE` / `WATCH` / `IGNORE` flag.**

> **Want the full radar with alerts, watchlists and history?**
> **Live Radar Pro** puts Polymarket and Telegram Gifts in one auto-refreshing dashboard and sends the `SNIPE` signals to Telegram:
> **https://9xj89gzrtw-hue.github.io/live-radar/** — key `TW1-RADAR` (390 ₽ / $14 USDC).
> Instant delivery: [Plati.Market lot 6358155](https://plati.market/itm/6358155) · [oplata.info checkout](https://oplata.info/asp2/pay_wm.asp?id_d=6358155&ai=1481449&lang=ru-RU).

---

## What you get

### Polymarket (`source: "polymarket"`)

| Field | Meaning |
|---|---|
| `question`, `slug`, `url` | the market and its public page |
| `liquidity`, `volume_24h`, `volume_total` | USD depth and turnover |
| `best_bid`, `best_ask`, `spread` | current book and its cost |
| `momentum_24h` | one-day price change (fraction) |
| `outcomes[]` | every outcome with price and implied probability |
| `overround` | sum of outcome prices − 1 |
| `arbitrage_pct` | when `overround < 0`, buying all outcomes costs less than $1 |
| `score`, `score_components`, `signal`, `reasons` | why it was flagged |

### Telegram Gifts (`source: "telegram-gifts"`)

| Field | Meaning |
|---|---|
| `collection`, `collection_slug`, `url` | Fragment collection |
| `floor_ton`, `floor_usd` | cheapest active listing |
| `sold_median_ton`, `sold_median_usd` | median of the visible sold sample |
| `spread_pct` | floor vs sold median; **negative = floor below recent sales** |
| `active_listings`, `sold_listings`, `last_sale_at` | visible market depth |
| `score`, `score_components`, `signal`, `reasons` | same transparent model |

## The score (0–100)

| Component | Max | Formula |
|---|---|---|
| Liquidity | 40 | `40 × log10(liquidity / 100) / 3`, clamped |
| Spread | 30 | `30 × (1 − spread / 0.10)`, clamped |
| Momentum | 20 | `20 × min(|24h change| / 0.15, 1)` |
| Volume | 10 | `10 × log10(volume24h / 1000) / 2`, clamped |

- **SNIPE** ≥ 70
- **WATCH** ≥ 50
- **IGNORE** < 50

For gifts the spread component rewards a floor *below* the recent sold median: `−40%` earns the full 40 points. A gift is only `SNIPE` when the score is ≥ 70 **and** the floor is at least 10% below recent sales — so a thin, illiquid collection cannot fake a signal.

## Quick start

```json
{
  "mode": "both",
  "limit": 50,
  "minLiquidity": 1000,
  "minScore": 50,
  "giftLimit": 15,
  "includeOffer": true
}
```

Local CLI:

```bash
npm install
node src/main.js --mode polymarket --limit 10
node src/main.js --mode gifts --gift-limit 5
npm test
```

## Data sources

- **Polymarket:** public Gamma API (`gamma-api.polymarket.com/markets`), no key, no wallet, no signature. Numbers arrive as strings and are normalised.
- **Telegram Gifts:** public Fragment catalogue pages (`fragment.com/gifts/<collection>?sort=price`). The Actor reads the server-rendered grid: item number, price in TON, status (`For sale` / `Sold` / `Not for sale`) and sold timestamp.
- **TON/USD:** `tonapi.io` rate endpoint; if it is unavailable the USD fields are `null` and the TON fields still work.

## Honest limits

- Gamma returns the top of the book, not the full depth. `spread` is the quoted best bid/ask, not a slippage simulation.
- Fragment's catalogue is a **visible sample**, not the full order book. `sold_median_ton` is the median of the listings shown on the page, and `sold_listings` is that sample size — both are returned so you can judge confidence.
- `overround` on multi-outcome markets is a sum of quoted prices; fees and resolution risk are not included.
- Nothing here is financial advice. The Actor flags setups; it does not place orders.

## Free vs Pro

| | This Actor | Live Radar Pro (`TW1-RADAR`) |
|---|---|---|
| Polymarket top markets | ✅ up to 200 | ✅ unlimited watchlists |
| Telegram Gifts collections | ✅ up to 60 | ✅ deep-dive per collection |
| Score + SNIPE flags | ✅ | ✅ custom thresholds |
| Auto-refresh dashboard | — | ✅ both markets in one window |
| Telegram alerts | — | ✅ |
| History between runs | — | ✅ CSV/XLSX |
| Price | free tier | **390 ₽ / $14 USDC**, lifetime key |

The Pro key is ECDSA P-256 signed and verified offline in the browser; instant delivery after SBP / RU card payment.

## Files

```
.actor/actor.json          Actor spec, categories, dataset + output schema
.actor/INPUT_SCHEMA.json   mode, limit, minLiquidity, minScore, giftLimit
src/polymarket.js          Gamma API client + normalisation
src/gifts.js               Fragment catalogue parser + collection summary
src/score.js               shared scoring model (explainable components)
src/run.js                 orchestration and dataset records
src/offer.js               single source of truth for the Pro offer
tests/                     offline tests (fixtures, no network)
```

## License

MIT. The Actor is free within the tier above; Live Radar Pro is a separate product sold on Plati.Market.
