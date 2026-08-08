// A3 — every attempt runs in a fresh temp workspace holding only the task's
// fixtures. Graders and task.json stay in the task dir: the agent must never
// be able to edit its own judge.
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskDef } from "./pack.js";

export interface Workspace {
  path: string;
  cleanup: () => void;
}

export function createWorkspace(task: TaskDef): Workspace {
  const path = mkdtempSync(join(tmpdir(), `vibecheck-${task.id}-`));
  const fixtures = join(task.dir, "fixtures");
  if (existsSync(fixtures)) cpSync(fixtures, path, { recursive: true });
  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}
