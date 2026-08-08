// D7 — honest statistics: Wilson intervals and a two-proportion z-test.

const Z95 = 1.959963984540054;

export interface Interval {
  low: number;
  high: number;
}

/** Wilson score interval at 95% for `successes` out of `n`. n=0 → [0,1]. */
export function wilsonInterval(successes: number, n: number): Interval {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = Z95 * Z95;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    // At the extremes the Wilson bound is exactly 0/1; clamp the fp noise.
    low: successes === 0 ? 0 : Math.max(0, (center - margin) / denom),
    high: successes === n ? 1 : Math.min(1, (center + margin) / denom),
  };
}

export interface Proportion {
  successes: number;
  n: number;
}

export interface TestResult {
  z: number;
  pValue: number; // two-sided
}

/** Two-proportion z-test (two-sided). Empty groups → no evidence (p=1). */
export function twoProportionTest(a: Proportion, b: Proportion): TestResult {
  if (a.n === 0 || b.n === 0) return { z: 0, pValue: 1 };
  const p1 = a.successes / a.n;
  const p2 = b.successes / b.n;
  const pooled = (a.successes + b.successes) / (a.n + b.n);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
  if (se === 0) return { z: 0, pValue: 1 };
  const z = (p1 - p2) / se;
  return { z, pValue: 2 * (1 - normalCdf(Math.abs(z))) };
}

/** Standard normal CDF via Abramowitz–Stegun erf approximation (|err| < 1.5e-7). */
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

// ---- Aggregation + verdict (D7) ----
import type { AttemptRecord } from "./schema.js";

export interface DailyPoint {
  day: string; // YYYY-MM-DD (UTC)
  n: number; // graded attempts (errors excluded)
  passes: number;
  errors: number;
  rate: number;
  ci: Interval;
}

/** Group records by UTC day. Harness errors are excluded from rates but counted. */
export function aggregateDaily(records: AttemptRecord[]): DailyPoint[] {
  const byDay = new Map<string, { n: number; passes: number; errors: number }>();
  for (const r of records) {
    const day = r.ts.slice(0, 10);
    const bucket = byDay.get(day) ?? { n: 0, passes: 0, errors: 0 };
    if (r.outcome === "error") bucket.errors++;
    else {
      bucket.n++;
      if (r.outcome === "pass") bucket.passes++;
    }
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, b]) => ({
      day,
      ...b,
      rate: b.n === 0 ? 0 : b.passes / b.n,
      ci: wilsonInterval(b.passes, b.n),
    }));
}

export type VerdictStatus = "ok" | "degraded" | "insufficient_data";

export interface Verdict {
  status: VerdictStatus;
  recent: Proportion;
  baseline: Proportion;
  pValue: number;
  reason: string;
}

export const RECENT_DAYS = 2;
export const BASELINE_DAYS = 14;
export const MIN_RECENT_N = 8;
export const MIN_BASELINE_N = 20;
const ALPHA = 0.05;

function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return dayString(d);
}

/** Recent window (today + yesterday) vs trailing baseline. Honest about low N. */
export function verdict(records: AttemptRecord[], asOf: Date = new Date()): Verdict {
  const today = dayString(asOf);
  const recentStart = shiftDays(today, -(RECENT_DAYS - 1));
  const baselineStart = shiftDays(recentStart, -BASELINE_DAYS);

  const recent: Proportion = { successes: 0, n: 0 };
  const baseline: Proportion = { successes: 0, n: 0 };
  for (const r of records) {
    if (r.outcome === "error") continue;
    const day = r.ts.slice(0, 10);
    const target =
      day >= recentStart && day <= today
        ? recent
        : day >= baselineStart && day < recentStart
          ? baseline
          : null;
    if (!target) continue;
    target.n++;
    if (r.outcome === "pass") target.successes++;
  }

  if (recent.n < MIN_RECENT_N || baseline.n < MIN_BASELINE_N) {
    return {
      status: "insufficient_data",
      recent,
      baseline,
      pValue: 1,
      reason: `need ≥${MIN_RECENT_N} recent and ≥${MIN_BASELINE_N} baseline graded attempts (have ${recent.n}/${baseline.n})`,
    };
  }

  const { pValue } = twoProportionTest(recent, baseline);
  const recentRate = recent.successes / recent.n;
  const baselineRate = baseline.successes / baseline.n;
  if (pValue < ALPHA && recentRate < baselineRate) {
    return {
      status: "degraded",
      recent,
      baseline,
      pValue,
      reason: `recent pass rate ${(recentRate * 100).toFixed(0)}% vs baseline ${(baselineRate * 100).toFixed(0)}% (p=${pValue.toExponential(2)})`,
    };
  }
  return {
    status: "ok",
    recent,
    baseline,
    pValue,
    reason: `recent ${(recentRate * 100).toFixed(0)}% vs baseline ${(baselineRate * 100).toFixed(0)}% — no significant drop`,
  };
}
