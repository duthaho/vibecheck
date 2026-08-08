// D6 — federation-ready attempt record: versioned, anonymous, no prompts/outputs.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SCHEMA_VERSION = 1;

export const OUTCOMES = ["pass", "fail", "error"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const CATEGORIES = ["code-fix", "instruction-following", "tool-use"] as const;
export type TaskCategory = (typeof CATEGORIES)[number];

export interface AttemptRecord {
  schema_version: number;
  run_id: string;
  ts: string; // UTC ISO 8601
  runner_id: string;
  harness_version: string;
  task_pack_hash: string;
  task_id: string;
  task_category: TaskCategory;
  model: string;
  claude_code_version: string;
  outcome: Outcome;
  duration_ms: number;
  num_turns: number;
  config_fingerprint: string | null;
}

export interface MakeRecordInput {
  runId: string;
  runnerId: string;
  harnessVersion: string;
  taskPackHash: string;
  taskId: string;
  taskCategory: TaskCategory;
  model: string;
  claudeCodeVersion: string;
  outcome: Outcome;
  durationMs: number;
  numTurns: number;
  configFingerprint: string | null;
  now?: Date;
}

export function makeRecord(input: MakeRecordInput): AttemptRecord {
  return {
    schema_version: SCHEMA_VERSION,
    run_id: input.runId,
    ts: (input.now ?? new Date()).toISOString(),
    runner_id: input.runnerId,
    harness_version: input.harnessVersion,
    task_pack_hash: input.taskPackHash,
    task_id: input.taskId,
    task_category: input.taskCategory,
    model: input.model,
    claude_code_version: input.claudeCodeVersion,
    outcome: input.outcome,
    duration_ms: input.durationMs,
    num_turns: input.numTurns,
    config_fingerprint: input.configFingerprint,
  };
}

const REQUIRED_STRINGS: (keyof AttemptRecord)[] = [
  "run_id",
  "ts",
  "runner_id",
  "harness_version",
  "task_pack_hash",
  "task_id",
  "model",
  "claude_code_version",
];

/** Returns a list of problems; empty list means valid. */
export function validateRecord(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return ["record is not an object"];
  const rec = value as Record<string, unknown>;
  const problems: string[] = [];

  if (rec.schema_version !== SCHEMA_VERSION) {
    problems.push(`schema_version must be ${SCHEMA_VERSION}`);
  }
  for (const key of REQUIRED_STRINGS) {
    if (typeof rec[key] !== "string" || rec[key] === "") {
      problems.push(`${key} must be a non-empty string`);
    }
  }
  if (typeof rec.ts === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(rec.ts)) {
    problems.push("ts must be a UTC ISO 8601 timestamp");
  }
  if (!OUTCOMES.includes(rec.outcome as Outcome)) {
    problems.push(`outcome must be one of ${OUTCOMES.join("|")}`);
  }
  if (!CATEGORIES.includes(rec.task_category as TaskCategory)) {
    problems.push(`task_category must be one of ${CATEGORIES.join("|")}`);
  }
  for (const key of ["duration_ms", "num_turns"] as const) {
    if (typeof rec[key] !== "number" || !Number.isFinite(rec[key] as number)) {
      problems.push(`${key} must be a finite number`);
    }
  }
  if (rec.config_fingerprint !== null && typeof rec.config_fingerprint !== "string") {
    problems.push("config_fingerprint must be a string or null");
  }
  return problems;
}

/** Anonymous, random (never machine-derived) id, created once and persisted. */
export function getRunnerId(dataDir: string): string {
  const file = join(dataDir, "runner_id");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(dataDir, { recursive: true });
  const id = randomBytes(8).toString("hex");
  try {
    writeFileSync(file, id + "\n", { flag: "wx" }); // exclusive: lose the race, adopt the winner
  } catch {
    return readFileSync(file, "utf8").trim();
  }
  return id;
}
