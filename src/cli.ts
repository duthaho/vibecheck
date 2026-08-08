#!/usr/bin/env node
// vibecheck CLI — run | render | report. Task failures are data (exit 0);
// only harness errors exit non-zero (AC1).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPack } from "./pack.js";
import { createWorkspace } from "./workspace.js";
import { runAttempt, type QueryFn } from "./runner.js";
import { appendRecords } from "./results.js";
import { getRunnerId, makeRecord } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function harnessVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function sdkQueryFn(): Promise<QueryFn> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  return ({ prompt, options }) => query({ prompt, options });
}

interface Flags {
  pack: string;
  results: string;
  task?: string;
  repeats: number;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    pack: join(HERE, "..", "tasks"),
    results: resolve("results", "results.jsonl"),
    repeats: 1,
  };
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i], args[i + 1]];
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    if (key === "--pack") flags.pack = resolve(value);
    else if (key === "--results") flags.results = resolve(value);
    else if (key === "--task") flags.task = value;
    else if (key === "--repeats") {
      flags.repeats = Number(value);
      if (!Number.isInteger(flags.repeats) || flags.repeats < 1) {
        throw new Error("--repeats must be a positive integer");
      }
    } else throw new Error(`Unknown flag ${key}`);
  }
  return flags;
}

export interface CliDeps {
  queryFn?: QueryFn;
}

async function runCmd(args: string[], deps: CliDeps): Promise<number> {
  const flags = parseFlags(args);
  const pack = loadPack(flags.pack);
  const tasks = flags.task ? pack.tasks.filter((t) => t.id === flags.task) : pack.tasks;
  if (tasks.length === 0) throw new Error(`No task matches "${flags.task}"`);

  const queryFn = deps.queryFn ?? (await sdkQueryFn());
  const runId = randomUUID();
  const runnerId = getRunnerId(dirname(flags.results));
  const version = harnessVersion();
  const records = [];

  for (const task of tasks) {
    for (let i = 0; i < flags.repeats; i++) {
      const ws = createWorkspace(task);
      try {
        const res = await runAttempt(task, ws.path, { queryFn });
        console.log(`${task.id} [${i + 1}/${flags.repeats}]: ${res.outcome} (${res.durationMs}ms, ${res.numTurns} turns)`);
        records.push(
          makeRecord({
            runId,
            runnerId,
            harnessVersion: version,
            taskPackHash: pack.hash,
            taskId: task.id,
            taskCategory: task.category,
            model: res.model,
            claudeCodeVersion: res.claudeCodeVersion,
            outcome: res.outcome,
            durationMs: res.durationMs,
            numTurns: res.numTurns,
            configFingerprint: null,
          }),
        );
      } finally {
        ws.cleanup();
      }
    }
  }

  appendRecords(flags.results, records);
  const passed = records.filter((r) => r.outcome === "pass").length;
  console.log(`run ${runId}: ${passed}/${records.length} passed → ${flags.results}`);
  return 0;
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "run") return await runCmd(rest, deps);
    console.error(`Usage: vibecheck <run> [--pack dir] [--results file] [--task id] [--repeats N]`);
    return 1;
  } catch (err) {
    console.error(`vibecheck: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

// Only self-execute when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
