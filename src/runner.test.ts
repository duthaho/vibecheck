import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type { TaskDef } from "./pack.js";
import { runAttempt, type QueryFn } from "./runner.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "sdk-messages.json");
const realMessages = JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown[];

const task: TaskDef = {
  id: "t",
  category: "code-fix",
  prompt: "fix it",
  allowedTools: ["Read", "Edit"],
  maxTurns: 10,
  timeoutMs: 5000,
  grade: { command: "true" },
  dir: mkdtempSync(join(tmpdir(), "vibecheck-runner-task-")),
};

function replay(messages: unknown[]): QueryFn {
  return () =>
    (async function* () {
      for (const m of messages) yield m;
    })();
}

describe("runAttempt", () => {
  const ws = mkdtempSync(join(tmpdir(), "vibecheck-runner-ws-"));

  it("replays the real captured stream and extracts metadata", async () => {
    let graded = 0;
    const res = await runAttempt(task, ws, {
      queryFn: replay(realMessages),
      gradeFn: async () => {
        graded++;
        return "pass";
      },
    });
    expect(res.outcome).toBe("pass");
    expect(res.model).toBe("claude-opus-5[1m]");
    expect(res.claudeCodeVersion).toBe("2.1.226");
    expect(res.numTurns).toBeGreaterThan(0);
    expect(res.durationMs).toBeGreaterThan(0);
    expect(graded).toBe(1);
  });

  it("passes task config into query options", async () => {
    let seen: Record<string, unknown> = {};
    const fn: QueryFn = ({ options }) => {
      seen = options as Record<string, unknown>;
      return replay(realMessages)({ prompt: "", options });
    };
    await runAttempt(task, ws, { queryFn: fn, gradeFn: async () => "pass" });
    expect(seen.cwd).toBe(ws);
    expect(seen.allowedTools).toEqual(["Read", "Edit"]);
    expect(seen.maxTurns).toBe(10);
    expect(seen.settingSources).toEqual([]);
    expect(seen.permissionMode).toBe("bypassPermissions");
  });

  it("maps an error-subtype result to outcome error without grading", async () => {
    const errorStream = realMessages.map((m) =>
      (m as { type?: string }).type === "result"
        ? { ...(m as object), subtype: "error_max_turns", is_error: true }
        : m,
    );
    let graded = 0;
    const res = await runAttempt(task, ws, {
      queryFn: replay(errorStream),
      gradeFn: async () => {
        graded++;
        return "pass";
      },
    });
    expect(res.outcome).toBe("error");
    expect(graded).toBe(0);
  });

  it("maps a thrown SDK error (T2 learning) to outcome error", async () => {
    const fn: QueryFn = () =>
      (async function* () {
        yield realMessages[0];
        throw new Error("Claude Code returned an error result: boom");
      })();
    const res = await runAttempt(task, ws, { queryFn: fn, gradeFn: async () => "pass" });
    expect(res.outcome).toBe("error");
  });

  it("aborts a hung query at timeoutMs and reports error", async () => {
    const fn: QueryFn = ({ options }) =>
      (async function* () {
        await new Promise((_, reject) => {
          (options as { abortController: AbortController }).abortController.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
          );
        });
      })();
    const res = await runAttempt({ ...task, timeoutMs: 200 }, ws, {
      queryFn: fn,
      gradeFn: async () => "pass",
    });
    expect(res.outcome).toBe("error");
  }, 5000);
});
