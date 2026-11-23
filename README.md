# Trend Rider — cbBTC 24h Race Bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/manhwanewyork/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/manhwanewyork/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A long-only trend-following bot that trades Coinbase Wrapped BTC (cbBTC)
against USDC on 1-minute on-chain bars, for the
[btc-race-24h-20261123-0511](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
bounty on [make.fun](https://make.fun/?ref=evw61zdb).

## Strategy

BTC trends in bursts and then goes flat for hours, while a full-size round
trip costs roughly 40–45 bps (4 bps fee + 2 bps slippage + ~12–17 bps of
pool impact per side). So the bot trades rarely:

- **Enter** (all four must hold on a bar's close, filled at the next open):
  close above EMA(30), 45-bar return above +30 bps, at least 46 closes
  seen, and at least 720 bars since the last sell. The buy spends all cash
  (one position, up to 100% of equity).
- **Exit** (whole position): the close falls 2.5% below the highest close
  since entry (trailing stop), or the position is worth 2.5% less than its
  cost (hard stop).
- Otherwise it sits in cash — in a falling market the correct trade is no
  trade, and the trailing stop caps the loss of any single round trip at
  roughly 2.5% plus costs.

The bot is fully deterministic: no wall clock, no randomness, no network —
the same bars always produce the same orders.

## Dev-window result (grade-local)

Net PnL **+$32.93** on the 24h dev window (1 trade: 1 buy, held to the
forced flatten), max drawdown 1.98%. Buy-and-hold on the same window makes
+$32.17 with the same risk; this bot enters a little later on momentum
confirmation and carries a 2.5% trailing stop the buy-and-hold bot lacks.
See `REPORT.md` for the full variant table and stress tests.

## Run

```sh
node main.ts
```

The bot speaks `agent-fun/bars-replay/v1` (NDJSON on stdin/stdout) via the
vendored kit shim in `vendor/makefun-bars.ts`. Grade it locally with the kit:

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot . --driver process
```

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, stdlib only)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's SDK shim
- `LICENSE` — MIT
- `REPORT.md` — strategy, parameters, and grade-local results

Built for the make.fun bounty
[btc-race-24h-20261123-0511](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511).
Play on [make.fun](https://make.fun/?ref=evw61zdb).
