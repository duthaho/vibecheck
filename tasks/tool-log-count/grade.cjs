const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

try {
  const logsDir = join(process.cwd(), "logs");
  let total = 0;
  for (const name of readdirSync(logsDir)) {
    if (!name.endsWith(".log")) continue;
    const text = readFileSync(join(logsDir, name), "utf8");
    total += text.split("\n").filter((l) => l !== "").length;
  }
  const summary = readFileSync(join(process.cwd(), "summary.txt"), "utf8").trim();
  process.exit(summary === `total_lines=${total}` ? 0 : 1);
} catch {
  process.exit(1);
}
