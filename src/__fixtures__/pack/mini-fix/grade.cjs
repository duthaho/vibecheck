// Grader runs with cwd = agent workspace; this script lives in the task dir.
const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

(async () => {
  const mod = await import(pathToFileURL(join(process.cwd(), "buggy.js")).href);
  const ok = mod.sum([1, 2, 3]) === 6 && mod.sum([]) === 0;
  process.exit(ok ? 0 : 1);
})().catch(() => process.exit(1));
