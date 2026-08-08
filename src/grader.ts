// AC2 — deterministic grading: a pure check over the final workspace state.
// The grader command runs with cwd = workspace; grader files stay in the task
// dir and are addressed via the $TASK_DIR placeholder, so the agent can never
// edit its judge.
import { spawn } from "node:child_process";
import type { Outcome } from "./schema.js";
import type { TaskDef } from "./pack.js";

export function runGrader(task: TaskDef, workspacePath: string): Promise<Outcome> {
  const command = task.grade.command.replaceAll("$TASK_DIR", task.dir);
  return new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd: workspacePath,
      shell: true,
      stdio: "ignore",
      timeout: task.timeoutMs,
    });
    child.on("error", () => resolvePromise("error"));
    child.on("exit", (code, signal) => {
      if (signal !== null) resolvePromise("error"); // killed (timeout) — harness issue, not a model fail
      else if (code === 0) resolvePromise("pass");
      else if (code === 126 || code === 127) resolvePromise("error"); // shell: not found / not executable
      else resolvePromise("fail");
    });
  });
}
