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
