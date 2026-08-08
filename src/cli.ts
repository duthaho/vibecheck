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
import { appendRecords, readRecords } from "./results.js";
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
      // Append immediately: an interrupted run must keep its finished attempts.
      appendRecords(flags.results, records.slice(-1));
    }
  }

  const passed = records.filter((r) => r.outcome === "pass").length;
  console.log(`run ${runId}: ${passed}/${records.length} passed → ${flags.results}`);
  return 0;
}

function parseKeyValues(args: string[], allowed: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = [args[i]!, args[i + 1]];
    if (!allowed.includes(key)) throw new Error(`Unknown flag ${key}`);
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    out.set(key, value);
  }
  return out;
}

function loadResultsOrThrow(file: string) {
  const records = readRecords(file);
  if (records.length === 0) throw new Error(`No records found in ${file} — run \`vibecheck run\` first`);
  return records;
}

async function renderCmd(args: string[]): Promise<number> {
  const flags = parseKeyValues(args, ["--results", "--out"]);
  const resultsFile = resolve(flags.get("--results") ?? join("results", "results.jsonl"));
  const outFile = resolve(flags.get("--out") ?? join("dashboard", "index.html"));
  const records = loadResultsOrThrow(resultsFile);
  const { renderDashboard } = await import("./render.js");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderDashboard(records));
  console.log(`dashboard: ${outFile} (${records.length} records)`);
  return 0;
}

async function reportCmd(args: string[]): Promise<number> {
  const flags = parseKeyValues(args, ["--results"]);
  const resultsFile = resolve(flags.get("--results") ?? join("results", "results.jsonl"));
  const records = loadResultsOrThrow(resultsFile);
  const { aggregateDaily, verdict, wilsonInterval } = await import("./stats.js");

  const v = verdict(records);
  const label = v.status === "ok" ? "OK" : v.status === "degraded" ? "DEGRADED" : "INSUFFICIENT DATA";
  console.log(`vibecheck: ${label}`);
  console.log(`  ${v.reason}`);

  const daily = aggregateDaily(records);
  const latest = daily.at(-1);
  if (latest) {
    console.log(
      `  latest day (${latest.day}): ${latest.passes}/${latest.n} pass [${(latest.ci.low * 100).toFixed(0)}–${(latest.ci.high * 100).toFixed(0)}%]${latest.errors ? ` (${latest.errors} harness errors)` : ""}`,
    );
  }
  const trend = daily.slice(-7).map((d) => `${d.day.slice(5)} ${(d.rate * 100).toFixed(0)}%`).join(" · ");
  if (trend) console.log(`  last 7 days: ${trend}`);

  const byTask = new Map<string, { pass: number; n: number }>();
  for (const r of records) {
    if (r.outcome === "error") continue;
    const t = byTask.get(r.task_id) ?? { pass: 0, n: 0 };
    t.n++;
    if (r.outcome === "pass") t.pass++;
    byTask.set(r.task_id, t);
  }
  for (const [taskId, t] of [...byTask.entries()].sort()) {
    const ci = wilsonInterval(t.pass, t.n);
    console.log(`  ${taskId}: ${t.pass}/${t.n} [${(ci.low * 100).toFixed(0)}–${(ci.high * 100).toFixed(0)}%]`);
  }
  return 0;
}

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === "run") return await runCmd(rest, deps);
    if (command === "render") return await renderCmd(rest);
    if (command === "report") return await reportCmd(rest);
    console.error(
      `Usage: vibecheck run [--pack dir] [--results file] [--task id] [--repeats N]\n       vibecheck render [--results file] [--out file]\n       vibecheck report [--results file]`,
    );
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
