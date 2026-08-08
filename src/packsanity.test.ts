// AC3/AC2 — the shipped pack must be a working canary: every task loads,
// and every grader FAILS on untouched fixtures. A task that passes with no
// agent work measures nothing.
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "./pack.js";
import { createWorkspace } from "./workspace.js";
import { runGrader } from "./grader.js";
import { CATEGORIES } from "./schema.js";

const SHIPPED_PACK = join(dirname(fileURLToPath(import.meta.url)), "..", "tasks");
const pack = loadPack(SHIPPED_PACK);

describe("shipped task pack", () => {
  it("has at least 6 tasks covering all three categories (AC3)", () => {
    expect(pack.tasks.length).toBeGreaterThanOrEqual(6);
    const seen = new Set(pack.tasks.map((t) => t.category));
    for (const cat of CATEGORIES) expect(seen).toContain(cat);
  });

  it("has a stable pack hash", () => {
    expect(pack.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  for (const task of pack.tasks) {
    it(`${task.id}: grader fails on pristine fixtures (red-baseline)`, async () => {
      const ws = createWorkspace(task);
      try {
        expect(await runGrader(task, ws.path)).toBe("fail");
      } finally {
        ws.cleanup();
      }
    });
  }
});
