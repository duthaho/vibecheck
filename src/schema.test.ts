import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_VERSION, makeRecord, validateRecord, getRunnerId } from "./schema.js";

const base = {
  runId: "run-1",
  runnerId: "abcd1234",
  harnessVersion: "0.1.0",
  taskPackHash: "deadbeef",
  taskId: "fix-offby1",
  taskCategory: "code-fix" as const,
  model: "claude-opus-5[1m]",
  claudeCodeVersion: "2.1.0",
  outcome: "pass" as const,
  durationMs: 12345,
  numTurns: 3,
  configFingerprint: null,
};

describe("makeRecord", () => {
  it("produces a valid record with schema version and UTC ISO timestamp", () => {
    const rec = makeRecord(base);
    expect(rec.schema_version).toBe(SCHEMA_VERSION);
    expect(rec.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(validateRecord(rec)).toEqual([]);
  });

  it("never contains prompt or output fields (D6: shareable as-is)", () => {
    const rec = makeRecord(base) as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      expect(key).not.toMatch(/prompt|output|message|text/i);
    }
  });
});

describe("validateRecord", () => {
  it("rejects a record with a bad outcome", () => {
    const rec = { ...makeRecord(base), outcome: "maybe" };
    expect(validateRecord(rec).length).toBeGreaterThan(0);
  });

  it("rejects a record missing required fields", () => {
    const { task_id: _drop, ...rest } = makeRecord(base);
    expect(validateRecord(rest).length).toBeGreaterThan(0);
  });

  it("rejects non-objects", () => {
    expect(validateRecord("nope").length).toBeGreaterThan(0);
    expect(validateRecord(null).length).toBeGreaterThan(0);
  });
});

describe("getRunnerId", () => {
  it("creates once, then stays stable across calls", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibecheck-schema-"));
    const a = getRunnerId(dir);
    const b = getRunnerId(dir);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs between data dirs (anonymous, not machine-derived)", () => {
    const d1 = mkdtempSync(join(tmpdir(), "vibecheck-schema-"));
    const d2 = mkdtempSync(join(tmpdir(), "vibecheck-schema-"));
    expect(getRunnerId(d1)).not.toBe(getRunnerId(d2));
  });
});

describe("validateRecord ts hardening", () => {
  it("rejects a non-ISO ts (injection vector)", () => {
    const bad = { ...makeRecord(base), ts: '"><style>' };
    expect(validateRecord(bad).length).toBeGreaterThan(0);
  });
});
