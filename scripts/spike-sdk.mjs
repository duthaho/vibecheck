// T2 spike: prove keyless (subscription) headless SDK run + capture real message shapes.
// Run: node scripts/spike-sdk.mjs
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = await mkdtemp(join(tmpdir(), "vibecheck-spike-"));
console.log("workspace:", cwd);

const captured = [];
let model = null;

// Note (learned in first spike run): when the result subtype is an error
// (e.g. error_max_turns), the SDK *throws* at the end of iteration — the
// runner must catch around the for-await, not just inspect result.subtype.
try {
  for await (const msg of query({
    prompt: "Create a file named hello.txt in the current directory containing exactly this content: hi",
    options: {
      cwd,
      settingSources: [],
      permissionMode: "bypassPermissions",
      allowedTools: ["Write"],
      maxTurns: 10,
    },
  })) {
    captured.push(msg);
    if (msg.type === "system" && msg.subtype === "init") {
      model = msg.model;
      console.log("init: model =", msg.model);
    }
    if (msg.type === "result") {
      console.log("result:", {
        subtype: msg.subtype,
        duration_ms: msg.duration_ms,
        num_turns: msg.num_turns,
        total_cost_usd: msg.total_cost_usd,
      });
    }
  }
} catch (err) {
  console.log("query threw (still have", captured.length, "captured messages):", err.message);
}

const content = await readFile(join(cwd, "hello.txt"), "utf8");
console.log("hello.txt content:", JSON.stringify(content));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "src", "__fixtures__");
await mkdir(fixtureDir, { recursive: true });
await writeFile(join(fixtureDir, "sdk-messages.json"), JSON.stringify(captured, null, 2));
console.log("captured", captured.length, "messages to src/__fixtures__/sdk-messages.json");

if (content.trim() !== "hi") throw new Error("SPIKE FAIL: wrong content");
if (!model) throw new Error("SPIKE FAIL: no model captured");
console.log("SPIKE OK");
