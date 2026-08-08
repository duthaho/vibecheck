const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

try {
  const digest = createHash("sha256")
    .update(readFileSync(join(process.cwd(), "data.txt")))
    .digest("hex");
  const manifest = readFileSync(join(process.cwd(), "manifest.txt"), "utf8").trim();
  process.exit(manifest === `${digest}  data.txt` ? 0 : 1);
} catch {
  process.exit(1);
}
