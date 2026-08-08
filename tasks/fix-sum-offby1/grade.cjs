const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

(async () => {
  const mod = await import(pathToFileURL(join(process.cwd(), "sum.js")).href);
  const ok =
    mod.sum([1, 2, 3]) === 6 &&
    mod.sum([]) === 0 &&
    mod.sum([5]) === 5 &&
    mod.sum([-1, 1, 10]) === 10;
  process.exit(ok ? 0 : 1);
})().catch(() => process.exit(1));
