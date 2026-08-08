const { readFileSync } = require("node:fs");
const { join } = require("node:path");

try {
  const text = readFileSync(join(process.cwd(), "report.csv"), "utf8").trim();
  const expected = [
    "name,score,grade",
    "Mai,91,A",
    "Linh,85,A",
    "Tuan,78,B",
    "Duc,66,C",
  ].join("\n");
  process.exit(text === expected ? 0 : 1);
} catch {
  process.exit(1);
}
