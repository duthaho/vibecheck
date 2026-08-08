import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskDef } from "./pack.js";
import { runGrader } from "./grader.js";

function makeTask(graderJs: string, command = "node $TASK_DIR/grade.cjs"): { task: TaskDef; workspace: string } {
  const taskDir = mkdtempSync(join(tmpdir(), "vibecheck-grader-task-"));
  writeFileSync(join(taskDir, "grade.cjs"), graderJs);
  const workspace = mkdtempSync(join(tmpdir(), "vibecheck-grader-ws-"));
  const task: TaskDef = {
    id: "t",
    category: "code-fix",
    prompt: "p",
    allowedTools: [],
    maxTurns: 1,
    timeoutMs: 5000,
    grade: { command },
    dir: taskDir,
  };
  return { task, workspace };
}

describe("runGrader", () => {
  it("returns pass on exit 0 and runs with cwd = workspace", async () => {
    const { task, workspace } = makeTask(
      `require("node:fs").writeFileSync("cwd.txt", process.cwd()); process.exit(0);`,
    );
    const result = await runGrader(task, workspace);
    expect(result).toBe("pass");
    const { readFileSync, realpathSync } = await import("node:fs");
    expect(realpathSync(readFileSync(join(workspace, "cwd.txt"), "utf8"))).toBe(realpathSync(workspace));
  });

  it("returns fail on non-zero exit", async () => {
    const { task, workspace } = makeTask(`process.exit(3);`);
    expect(await runGrader(task, workspace)).toBe("fail");
  });

  it("substitutes $TASK_DIR with the task's absolute dir", async () => {
    const taskDir = mkdtempSync(join(tmpdir(), "vibecheck-grader-task-"));
    mkdirSync(join(taskDir, "nested"));
    writeFileSync(join(taskDir, "nested", "check.cjs"), "process.exit(0);");
    const workspace = mkdtempSync(join(tmpdir(), "vibecheck-grader-ws-"));
    const task: TaskDef = {
      id: "t",
      category: "code-fix",
      prompt: "p",
      allowedTools: [],
      maxTurns: 1,
      timeoutMs: 5000,
      grade: { command: "node $TASK_DIR/nested/check.cjs" },
      dir: taskDir,
    };
    expect(await runGrader(task, workspace)).toBe("pass");
  });

  it("returns error when the grader cannot be spawned", async () => {
    const { task, workspace } = makeTask("");
    task.grade.command = "definitely-not-a-real-binary-xyz";
    expect(await runGrader(task, workspace)).toBe("error");
  });

  it("returns error when the grader exceeds the timeout", async () => {
    const { task, workspace } = makeTask(`setTimeout(() => process.exit(0), 60000);`);
    task.timeoutMs = 300;
    expect(await runGrader(task, workspace)).toBe("error");
  });
});

describe("runGrader hardening", () => {
  it("handles a task dir containing spaces (quoted $TASK_DIR)", async () => {
    const parent = mkdtempSync(join(tmpdir(), "vibecheck grader space-"));
    const taskDir = join(parent, "my task");
    mkdirSync(taskDir);
    writeFileSync(join(taskDir, "grade.cjs"), "process.exit(0);");
    const workspace = mkdtempSync(join(tmpdir(), "vibecheck-grader-ws-"));
    const task: TaskDef = {
      id: "t", category: "code-fix", prompt: "p", allowedTools: [],
      maxTurns: 1, timeoutMs: 5000,
      grade: { command: "node $TASK_DIR/grade.cjs" }, dir: taskDir,
    };
    expect(await runGrader(task, workspace)).toBe("pass");
  });
});
