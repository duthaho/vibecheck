import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./cli.js";
import { readRecords } from "./results.js";
import { validateRecord } from "./schema.js";
import type { QueryFn } from "./runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PACK = join(HERE, "__fixtures__", "pack");
const realMessages = JSON.parse(
  readFileSync(join(HERE, "__fixtures__", "sdk-messages.json"), "utf8"),
) as unknown[];

const replay: QueryFn = () =>
  (async function* () {
    for (const m of realMessages) yield m;
  })();

function tmpResults(): string {
  return join(mkdtempSync(join(tmpdir(), "vibecheck-cli-")), "results.jsonl");
}

describe("cli run", () => {
  it("runs the pack against the mocked SDK and appends valid records", async () => {
    const results = tmpResults();
    const code = await main(
      ["run", "--pack", FIXTURE_PACK, "--results", results, "--repeats", "2"],
      { queryFn: replay },
    );
    expect(code).toBe(0);
    const records = readRecords(results);
    expect(records).toHaveLength(2); // 1 task × 2 repeats
    for (const rec of records) {
      expect(validateRecord(rec)).toEqual([]);
      expect(rec.task_id).toBe("mini-fix");
      expect(rec.model).toBe("claude-opus-5[1m]");
    }
  });

  it("a failing task is data, not an error: still exits 0 (codex #6)", async () => {
    // The mocked SDK never edits the workspace, so mini-fix's grader fails.
    const results = tmpResults();
    const code = await main(["run", "--pack", FIXTURE_PACK, "--results", results], {
      queryFn: replay,
    });
    expect(code).toBe(0);
    expect(readRecords(results)[0]!.outcome).toBe("fail");
  });

  it("--task filters to one task and rejects unknown ids", async () => {
    const results = tmpResults();
    const ok = await main(
      ["run", "--pack", FIXTURE_PACK, "--results", results, "--task", "mini-fix"],
      { queryFn: replay },
    );
    expect(ok).toBe(0);
    const bad = await main(
      ["run", "--pack", FIXTURE_PACK, "--results", results, "--task", "nope"],
      { queryFn: replay },
    );
    expect(bad).toBe(1);
  });

  it("harness errors (bad pack dir) exit 1", async () => {
    const code = await main(["run", "--pack", "/nonexistent-pack", "--results", tmpResults()], {
      queryFn: replay,
    });
    expect(code).toBe(1);
  });

  it("unknown command exits 1", async () => {
    expect(await main(["dance"], { queryFn: replay })).toBe(1);
  });
});
