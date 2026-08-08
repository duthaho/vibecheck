// Runs one task attempt through the (injected) Agent SDK, then grades the
// final workspace state. T2 learnings baked in: the SDK *throws* after an
// error-subtype result, so the whole iteration is wrapped; timeouts go
// through the AbortController the SDK expects.
import { runGrader } from "./grader.js";
import type { Outcome } from "./schema.js";
import type { TaskDef } from "./pack.js";

export interface QueryArgs {
  prompt: string;
  options: Record<string, unknown>;
}

export type QueryFn = (args: QueryArgs) => AsyncIterable<unknown>;

export interface AttemptResult {
  outcome: Outcome;
  model: string;
  claudeCodeVersion: string;
  durationMs: number;
  numTurns: number;
}

interface SdkMessage {
  type?: string;
  subtype?: string;
  model?: string;
  claude_code_version?: string;
  is_error?: boolean;
  duration_ms?: number;
  num_turns?: number;
}

export interface RunnerDeps {
  queryFn: QueryFn;
  gradeFn?: (task: TaskDef, workspacePath: string) => Promise<Outcome>;
}

export async function runAttempt(
  task: TaskDef,
  workspacePath: string,
  deps: RunnerDeps,
): Promise<AttemptResult> {
  const gradeFn = deps.gradeFn ?? runGrader;
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), task.timeoutMs);
  const started = Date.now();

  let model = "unknown";
  let claudeCodeVersion = "unknown";
  let durationMs = 0;
  let numTurns = 0;
  let resultOk = false;

  try {
    const stream = deps.queryFn({
      prompt: task.prompt,
      options: {
        cwd: workspacePath,
        settingSources: [],
        permissionMode: "bypassPermissions",
        allowedTools: task.allowedTools,
        maxTurns: task.maxTurns,
        abortController,
      },
    });
    for await (const raw of stream) {
      const msg = raw as SdkMessage;
      if (msg.type === "system" && msg.subtype === "init") {
        if (msg.model) model = msg.model;
        if (msg.claude_code_version) claudeCodeVersion = msg.claude_code_version;
      }
      if (msg.type === "result") {
        durationMs = msg.duration_ms ?? Date.now() - started;
        numTurns = msg.num_turns ?? 0;
        resultOk = msg.subtype === "success" && !msg.is_error;
      }
    }
  } catch {
    resultOk = false; // thrown error result, abort, or transport failure
  } finally {
    clearTimeout(timer);
  }

  if (durationMs === 0) durationMs = Date.now() - started;

  if (!resultOk) {
    return { outcome: "error", model, claudeCodeVersion, durationMs, numTurns };
  }
  let outcome: Outcome;
  try {
    outcome = await gradeFn(task, workspacePath);
  } catch {
    outcome = "error"; // a crashing grader is a harness problem, never a model fail
  }
  return { outcome, model, claudeCodeVersion, durationMs, numTurns };
}
