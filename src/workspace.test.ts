import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "./pack.js";
import { createWorkspace } from "./workspace.js";

const FIXTURE_PACK = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "pack");

describe("createWorkspace", () => {
  const task = loadPack(FIXTURE_PACK).tasks[0]!;

  it("copies fixtures into a fresh temp dir", () => {
    const ws = createWorkspace(task);
    expect(ws.path).not.toContain(task.dir);
    expect(existsSync(join(ws.path, "buggy.js"))).toBe(true);
    expect(readFileSync(join(ws.path, "buggy.js"), "utf8")).toContain("arr.length - 1");
    ws.cleanup();
  });

  it("does not copy grader or task.json into the workspace", () => {
    const ws = createWorkspace(task);
    expect(existsSync(join(ws.path, "grade.cjs"))).toBe(false);
    expect(existsSync(join(ws.path, "task.json"))).toBe(false);
    ws.cleanup();
  });

  it("gives each attempt its own directory and cleanup removes it", () => {
    const a = createWorkspace(task);
    const b = createWorkspace(task);
    expect(a.path).not.toBe(b.path);
    a.cleanup();
    b.cleanup();
    expect(existsSync(a.path)).toBe(false);
    expect(existsSync(b.path)).toBe(false);
  });

  it("works for a task with no fixtures dir (empty workspace)", () => {
    const ws = createWorkspace({ ...task, dir: join(task.dir, "fixtures") });
    expect(existsSync(ws.path)).toBe(true);
    ws.cleanup();
  });
});
