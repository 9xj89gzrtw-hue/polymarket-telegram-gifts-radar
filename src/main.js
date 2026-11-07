/**
 * Entry point. On Apify it runs as an Actor; locally it is a CLI:
 *
 *   node src/main.js --mode polymarket --limit 10
 *   node src/main.js --mode gifts --gift-limit 5
 */
import fs from "node:fs";
import { run } from "./run.js";

function parseArgs(argv) {
  const args = { mode: "both", includeOffer: true };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--mode" && next) { args.mode = next; i += 1; }
    else if (key === "--limit" && next) { args.limit = Number(next); i += 1; }
    else if (key === "--gift-limit" && next) { args.giftLimit = Number(next); i += 1; }
    else if (key === "--min-liquidity" && next) { args.minLiquidity = Number(next); i += 1; }
    else if (key === "--min-score" && next) { args.minScore = Number(next); i += 1; }
    else if (key === "--input" && next) { args.input = next; i += 1; }
    else if (key === "--out" && next) { args.out = next; i += 1; }
    else if (key === "--no-offer") { args.includeOffer = false; }
  }
  return args;
}

async function localMain() {
  const args = parseArgs(process.argv);
  const input = args.input
    ? { ...JSON.parse(fs.readFileSync(args.input, "utf8")), ...args }
    : args;
  const out = [];
  const summary = await run(input, async (row) => out.push(row), { log: console.error });
  const payload = JSON.stringify({ summary, items: out }, null, 2);
  if (args.out) fs.writeFileSync(args.out, payload + "\n");
  else process.stdout.write(payload + "\n");
}

async function actorMain() {
  const { Actor } = await import("apify");
  await Actor.init();
  try {
    const input = (await Actor.getInput()) || {};
    const summary = await run(input, (row) => Actor.pushData(row), { log: console.log });
    console.log("run summary:", JSON.stringify(summary, null, 2));
    await Actor.setValue("SUMMARY", summary);
  } finally {
    await Actor.exit();
  }
}

const isActor = Boolean(process.env.APIFY_IS_AT_HOME || process.env.ACTOR_ID || process.env.APIFY_TOKEN);
(isActor ? actorMain() : localMain()).catch((err) => {
  console.error(err);
  process.exit(1);
});
