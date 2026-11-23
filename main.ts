// Trend Rider for cbBTC — a long-only trend-following bot for the
// agent-fun/bars-replay/v1 protocol (hello, then one batch per bar,
// one reply with orders per batch).
//
// Idea: BTC trends in bursts and then goes flat for hours. A round trip
// costs roughly 40-45 bps here (4 bps fee + 2 bps slippage + ~12-17 bps
// of pool impact per side at the dev window's depths), so the bot must
// trade rarely. It waits for a confirmed up-trend, rides it with a wide
// trailing stop, and otherwise sits in cash.
//
// Entry (all four must hold on a bar's close, filled at the next open):
//   1. at least 46 closes seen, so the momentum lookback is defined;
//   2. the close is above its EMA(30) — the short trend points up;
//   3. the 45-bar return is above +30 bps — the move is real, not noise;
//   4. at least 720 bars have passed since the last sell, so a whipsaw
//      exit cannot be followed by an immediate re-entry.
// The buy spends all available cash (one position, up to 100% of equity).
//
// Exit (the whole position, on a bar's close):
//   - trailing stop: the close falls 250 bps (2.5%) below the highest
//     close seen since entry; or
//   - hard stop: the position is worth 250 bps less than its cost.
// Either exit also starts the 720-bar re-entry cooldown.
//
// No wall clock, no randomness, no network: the same bars always give
// the same orders, so the two grading runs match byte for byte.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// EMA span for the trend filter.
const TREND_SPAN = 30;
// Momentum lookback in bars and the minimum 45-bar return, in bps.
const MOMENTUM_BARS = 45;
const MOMENTUM_MIN_BPS = 30;
// Trailing stop and hard stop, both in bps below the reference.
const TRAIL_BPS = 250;
const STOP_BPS = 250;
// Bars to wait after a sell before buying again.
const REENTRY_COOLDOWN_BARS = 720;
// Slippage cap on every order, in bps from the latest close.
const MAX_SLIPPAGE_BPS = 100;

// Closes are kept in the harness's raw price units (price_scale 5), so
// every comparison below is a ratio and the scale cancels out.
const closes: number[] = [];

// EMA(30) state: seeded with the mean of the first TREND_SPAN closes,
// then advanced by 2 / (span + 1) toward each new close.
let emaWarmup: number[] = [];
let emaValue: number | null = null;

function emaPush(close: number): void {
  if (emaValue !== null) {
    emaValue += (2 / (TREND_SPAN + 1)) * (close - emaValue);
    return;
  }
  emaWarmup.push(close);
  if (emaWarmup.length === TREND_SPAN) {
    let total = 0;
    for (const c of emaWarmup) total += c;
    emaValue = total / TREND_SPAN;
  }
}

// Highest close since the current position was opened; 0 while flat.
let peakClose = 0;
// Seq of the batch on which the last sell was decided; far in the past
// at the start so the first entry is never blocked by the cooldown.
let lastSellSeq = -REENTRY_COOLDOWN_BARS;

function momentumBps(): number | null {
  if (closes.length <= MOMENTUM_BARS) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - MOMENTUM_BARS];
  return ((now - then) / then) * 10000;
}

function shouldEnter(state: BarsState, close: number): boolean {
  if (emaValue === null) return false;
  if (state.seq - lastSellSeq < REENTRY_COOLDOWN_BARS) return false;
  const momentum = momentumBps();
  if (momentum === null) return false;
  return close > emaValue && momentum > MOMENTUM_MIN_BPS;
}

function shouldExit(state: BarsState, close: number): boolean {
  const held = state.positions.get(SYMBOL);
  if (held === undefined) return false;
  if (close > peakClose) peakClose = close;
  if (peakClose > 0 && close * 10000 < peakClose * (10000 - TRAIL_BPS)) return true;
  const value = state.value(SYMBOL, held.qty);
  if (value * 10000n < held.cost * BigInt(10000 - STOP_BPS)) return true;
  return false;
}

await runBars({
  onBatch(state, batch) {
    const orders: (BuyInput | SellInput)[] = [];
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      const close = Number(bar.c);
      closes.push(close);
      emaPush(close);
    }
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b: Bar) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      if (shouldExit(state, close)) {
        lastSellSeq = state.seq;
        peakClose = 0;
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
      return orders;
    }
    if (shouldEnter(state, close)) {
      const cash = state.cash;
      const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
      if (cash >= minNotional) {
        peakClose = close;
        orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }
    return orders;
  },
});
