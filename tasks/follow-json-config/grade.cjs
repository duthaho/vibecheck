const { readFileSync } = require("node:fs");
const { join } = require("node:path");

try {
  const parsed = JSON.parse(readFileSync(join(process.cwd(), "config.json"), "utf8"));
  const expected = {
    service: "vibecheck",
    retries: 3,
    limits: { timeout_ms: 30000, max_parallel: 4 },
    tags: ["canary", "nightly"],
  };
  const ok = JSON.stringify(sortKeys(parsed)) === JSON.stringify(sortKeys(expected));
  process.exit(ok ? 0 : 1);
} catch {
  process.exit(1);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    );
  }
  return value;
}
