// D1 — the task pack format: a task is a folder with task.json + fixtures/ + grader files.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CATEGORIES, type TaskCategory } from "./schema.js";

export interface TaskDef {
  id: string;
  category: TaskCategory;
  prompt: string;
  allowedTools: string[];
  maxTurns: number;
  timeoutMs: number;
  grade: { command: string };
  /** Absolute path to the task folder (graders live here, never in the workspace). */
  dir: string;
}

export interface Pack {
  dir: string;
  tasks: TaskDef[];
  hash: string;
}

function fail(taskDir: string, msg: string): never {
  throw new Error(`Invalid task at ${taskDir}: ${msg}`);
}

function parseTask(taskDir: string): TaskDef {
  const raw = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf8")) as Record<string, unknown>;
  const folderName = taskDir.split("/").at(-1)!;

  if (typeof raw.id !== "string" || raw.id === "") fail(taskDir, "id must be a non-empty string");
  if (raw.id !== folderName) fail(taskDir, `id "${raw.id}" must match folder name "${folderName}"`);
  if (!CATEGORIES.includes(raw.category as TaskCategory)) {
    fail(taskDir, `category must be one of ${CATEGORIES.join("|")}`);
  }
  if (typeof raw.prompt !== "string" || raw.prompt === "") fail(taskDir, "prompt must be a non-empty string");
  if (!Array.isArray(raw.allowedTools) || raw.allowedTools.some((t) => typeof t !== "string")) {
    fail(taskDir, "allowedTools must be an array of strings");
  }
  if (typeof raw.maxTurns !== "number" || raw.maxTurns < 1) fail(taskDir, "maxTurns must be a positive number");
  if (typeof raw.timeoutMs !== "number" || raw.timeoutMs < 1) fail(taskDir, "timeoutMs must be a positive number");
  const grade = raw.grade as { command?: unknown } | undefined;
  if (!grade || typeof grade.command !== "string" || grade.command === "") {
    fail(taskDir, "grade.command must be a non-empty string");
  }

  return {
    id: raw.id,
    category: raw.category as TaskCategory,
    prompt: raw.prompt,
    allowedTools: raw.allowedTools as string[],
    maxTurns: raw.maxTurns,
    timeoutMs: raw.timeoutMs,
    grade: { command: grade.command },
    dir: taskDir,
  };
}

export function loadPack(packDir: string): Pack {
  const abs = resolve(packDir);
  const taskDirs = readdirSync(abs)
    .map((name) => join(abs, name))
    .filter((p) => statSync(p).isDirectory())
    .sort();
  const tasks = taskDirs.map(parseTask);
  if (tasks.length === 0) throw new Error(`No tasks found in pack dir ${abs}`);
  return { dir: abs, tasks, hash: packHash(abs) };
}

/** sha256 over sorted (relative path, content) pairs — any change reflows the hash. */
export function packHash(packDir: string): string {
  const abs = resolve(packDir);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(abs);
  const h = createHash("sha256");
  for (const file of files) {
    h.update(relative(abs, file));
    h.update("\0");
    h.update(readFileSync(file));
    h.update("\0");
  }
  return h.digest("hex");
}
