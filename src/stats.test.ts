import { describe, expect, it } from "vitest";
import { wilsonInterval, twoProportionTest } from "./stats.js";

describe("wilsonInterval", () => {
  it("matches textbook value for 8/10 at 95%", () => {
    const { low, high } = wilsonInterval(8, 10);
    expect(low).toBeCloseTo(0.49, 2);
    expect(high).toBeCloseTo(0.943, 2);
  });

  it("is [0, x] for 0/n and [x, 1] for n/n", () => {
    const zero = wilsonInterval(0, 10);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0);
    const full = wilsonInterval(10, 10);
    expect(full.high).toBe(1);
    expect(full.low).toBeLessThan(1);
  });

  it("returns the degenerate [0,1] for n=0", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe("twoProportionTest", () => {
  it("matches textbook value for 40/100 vs 60/100", () => {
    const { z, pValue } = twoProportionTest(
      { successes: 40, n: 100 },
      { successes: 60, n: 100 },
    );
    expect(Math.abs(z)).toBeCloseTo(2.828, 2);
    expect(pValue).toBeCloseTo(0.0047, 3);
  });

  it("gives p=1 for identical proportions", () => {
    const { pValue } = twoProportionTest(
      { successes: 5, n: 10 },
      { successes: 5, n: 10 },
    );
    expect(pValue).toBeCloseTo(1, 5);
  });

  it("handles empty groups without NaN", () => {
    const { pValue } = twoProportionTest(
      { successes: 0, n: 0 },
      { successes: 5, n: 10 },
    );
    expect(pValue).toBe(1);
  });
});
