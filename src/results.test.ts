import { describe, expect, it, vi } from "vitest";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRecord } from "./schema.js";
import { appendRecords, readRecords } from "./results.js";

const rec = makeRecord({
  runId: "r1",
  runnerId: "abcd",
  harnessVersion: "0.1.0",
  taskPackHash: "h",
  taskId: "t",
  taskCategory: "code-fix",
  model: "m",
  claudeCodeVersion: "v",
  outcome: "pass",
  durationMs: 1,
  numTurns: 1,
  configFingerprint: null,
});

describe("results store", () => {
  it("appends JSONL and reads it back", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vibecheck-results-")), "results.jsonl");
    appendRecords(file, [rec, { ...rec, outcome: "fail" }]);
    appendRecords(file, [rec]);
    const back = readRecords(file);
    expect(back).toHaveLength(3);
    expect(back[1]!.outcome).toBe("fail");
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(3);
  });

  it("skips corrupt lines with a warning instead of dying", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vibecheck-results-")), "results.jsonl");
    appendRecords(file, [rec]);
    appendFileSync(file, "{not json\n");
    appendFileSync(file, JSON.stringify({ hello: "not a record" }) + "\n");
    appendRecords(file, [rec]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const back = readRecords(file);
    expect(back).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns [] for a missing file", () => {
    expect(readRecords(join(tmpdir(), "does-not-exist.jsonl"))).toEqual([]);
  });
});
