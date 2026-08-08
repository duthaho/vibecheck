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

// ---- T5: aggregation + verdict ----
import { aggregateDaily, verdict } from "./stats.js";
import { makeRecord, type AttemptRecord } from "./schema.js";

function rec(day: string, outcome: "pass" | "fail" | "error"): AttemptRecord {
  return makeRecord({
    runId: "r",
    runnerId: "abcd",
    harnessVersion: "0.1.0",
    taskPackHash: "hash",
    taskId: "t",
    taskCategory: "code-fix",
    model: "m",
    claudeCodeVersion: "v",
    outcome,
    durationMs: 1,
    numTurns: 1,
    configFingerprint: null,
    now: new Date(`${day}T12:00:00Z`),
  });
}

function days(spec: Record<string, { pass: number; fail: number; error?: number }>): AttemptRecord[] {
  const out: AttemptRecord[] = [];
  for (const [day, mix] of Object.entries(spec)) {
    for (let i = 0; i < mix.pass; i++) out.push(rec(day, "pass"));
    for (let i = 0; i < mix.fail; i++) out.push(rec(day, "fail"));
    for (let i = 0; i < (mix.error ?? 0); i++) out.push(rec(day, "error"));
  }
  return out;
}

describe("aggregateDaily", () => {
  it("groups by UTC day, excludes harness errors from rates", () => {
    const daily = aggregateDaily(days({ "2026-08-01": { pass: 3, fail: 1, error: 2 } }));
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ day: "2026-08-01", n: 4, passes: 3 });
    expect(daily[0]!.rate).toBeCloseTo(0.75, 5);
    expect(daily[0]!.ci.low).toBeGreaterThan(0);
  });

  it("sorts days ascending", () => {
    const daily = aggregateDaily(days({ "2026-08-02": { pass: 1, fail: 0 }, "2026-08-01": { pass: 1, fail: 0 } }));
    expect(daily.map((d) => d.day)).toEqual(["2026-08-01", "2026-08-02"]);
  });
});

describe("verdict", () => {
  const asOf = new Date("2026-08-15T23:00:00Z");

  it("returns insufficient_data below the N thresholds", () => {
    const v = verdict(days({ "2026-08-15": { pass: 2, fail: 1 } }), asOf);
    expect(v.status).toBe("insufficient_data");
  });

  it("returns ok when recent matches a healthy baseline", () => {
    const spec: Record<string, { pass: number; fail: number }> = {};
    for (let d = 1; d <= 15; d++) spec[`2026-08-${String(d).padStart(2, "0")}`] = { pass: 8, fail: 2 };
    const v = verdict(days(spec), asOf);
    expect(v.status).toBe("ok");
  });

  it("returns degraded when recent days collapse vs baseline", () => {
    const spec: Record<string, { pass: number; fail: number }> = {};
    for (let d = 1; d <= 13; d++) spec[`2026-08-${String(d).padStart(2, "0")}`] = { pass: 9, fail: 1 };
    spec["2026-08-14"] = { pass: 2, fail: 8 };
    spec["2026-08-15"] = { pass: 1, fail: 9 };
    const v = verdict(days(spec), asOf);
    expect(v.status).toBe("degraded");
    expect(v.pValue).toBeLessThan(0.05);
  });

  it("never says degraded when recent is better than baseline", () => {
    const spec: Record<string, { pass: number; fail: number }> = {};
    for (let d = 1; d <= 13; d++) spec[`2026-08-${String(d).padStart(2, "0")}`] = { pass: 5, fail: 5 };
    spec["2026-08-14"] = { pass: 10, fail: 0 };
    spec["2026-08-15"] = { pass: 10, fail: 0 };
    expect(verdict(days(spec), asOf).status).toBe("ok");
  });
});
