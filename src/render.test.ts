import { describe, expect, it } from "vitest";
import { makeRecord, type AttemptRecord } from "./schema.js";
import { renderDashboard } from "./render.js";

function rec(day: string, taskId: string, outcome: "pass" | "fail" | "error"): AttemptRecord {
  return makeRecord({
    runId: "r",
    runnerId: "abcd",
    harnessVersion: "0.1.0",
    taskPackHash: "hash",
    taskId,
    taskCategory: "code-fix",
    model: "claude-opus-5[1m]",
    claudeCodeVersion: "2.1.226",
    outcome,
    durationMs: 1000,
    numTurns: 3,
    configFingerprint: null,
    now: new Date(`${day}T12:00:00Z`),
  });
}

function healthyHistory(): AttemptRecord[] {
  const out: AttemptRecord[] = [];
  for (let d = 1; d <= 16; d++) {
    const day = `2026-08-${String(d).padStart(2, "0")}`;
    for (let i = 0; i < 8; i++) out.push(rec(day, i % 2 ? "fix-sum-offby1" : "tool-log-count", "pass"));
    out.push(rec(day, "fix-sum-offby1", "fail"));
  }
  return out;
}

describe("renderDashboard", () => {
  const asOf = new Date("2026-08-16T23:00:00Z");
  const html = renderDashboard(healthyHistory(), asOf);

  it("is a self-contained HTML document (no external resources)", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/href\s*=\s*["']https?:/i);
  });

  it("shows the verdict and its reason", () => {
    expect(html).toMatch(/OK|DEGRADED|INSUFFICIENT/);
    expect(html).toContain("baseline");
  });

  it("draws an SVG trend with CI band and daily points", () => {
    expect(html).toContain("<svg");
    expect(html).toContain("2026-08-16");
    expect(html).toContain("ci-band");
  });

  it("lists per-task stats", () => {
    expect(html).toContain("fix-sum-offby1");
    expect(html).toContain("tool-log-count");
  });

  it("states insufficient data honestly when records are sparse (D7)", () => {
    const sparse = renderDashboard([rec("2026-08-16", "fix-sum-offby1", "pass")], asOf);
    expect(sparse).toMatch(/INSUFFICIENT/);
  });
});

describe("renderDashboard hardening", () => {
  const asOf = new Date("2026-08-16T23:00:00Z");

  it("shows the 7-day rolling mean line (D3)", () => {
    const html = renderDashboard(healthyHistory(), asOf);
    expect(html).toContain("rolling-mean");
  });

  it("escapes hostile strings instead of injecting markup", () => {
    const hostile = rec("2026-08-16", `"><script>alert(1)</script>`, "pass");
    const html = renderDashboard([hostile], asOf);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toMatch(/title="[^"]*"><script/);
  });

  it("does not plot error-only days as 0% pass", () => {
    const html = renderDashboard(
      [...healthyHistory(), rec("2026-08-17", "fix-sum-offby1", "error")],
      new Date("2026-08-17T23:00:00Z"),
    );
    expect(html).not.toMatch(/<circle[^>]*<title>2026-08-17/);
  });
});
