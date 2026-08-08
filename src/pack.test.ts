import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack, packHash } from "./pack.js";

const FIXTURE_PACK = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "pack");

describe("loadPack", () => {
  it("loads the fixture mini-pack", () => {
    const pack = loadPack(FIXTURE_PACK);
    expect(pack.tasks).toHaveLength(1);
    const task = pack.tasks[0]!;
    expect(task.id).toBe("mini-fix");
    expect(task.category).toBe("code-fix");
    expect(task.allowedTools).toEqual(["Read", "Edit"]);
    expect(task.grade.command).toContain("$TASK_DIR");
    expect(task.dir).toContain("mini-fix");
  });

  it("rejects a task with an invalid category", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibecheck-pack-"));
    cpSync(FIXTURE_PACK, dir, { recursive: true });
    const taskJson = join(dir, "mini-fix", "task.json");
    writeFileSync(
      taskJson,
      JSON.stringify({
        id: "mini-fix",
        category: "vibes",
        prompt: "x",
        allowedTools: [],
        maxTurns: 1,
        timeoutMs: 1000,
        grade: { command: "true" },
      }),
    );
    expect(() => loadPack(dir)).toThrow(/category/);
  });

  it("rejects a task whose folder name disagrees with its id", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibecheck-pack-"));
    cpSync(join(FIXTURE_PACK, "mini-fix"), join(dir, "other-name"), { recursive: true });
    expect(() => loadPack(dir)).toThrow(/id/);
  });
});

describe("packHash", () => {
  it("is stable for identical content", () => {
    expect(packHash(FIXTURE_PACK)).toBe(packHash(FIXTURE_PACK));
    expect(packHash(FIXTURE_PACK)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any file in the pack changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "vibecheck-pack-"));
    cpSync(FIXTURE_PACK, dir, { recursive: true });
    const before = packHash(dir);
    writeFileSync(join(dir, "mini-fix", "fixtures", "buggy.js"), "// mutated\n");
    expect(packHash(dir)).not.toBe(before);
  });
});
