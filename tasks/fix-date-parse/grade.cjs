const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

function eq(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

(async () => {
  const mod = await import(pathToFileURL(join(process.cwd(), "dateparse.js")).href);
  const ok =
    eq(mod.parseYmd("2024-03-05"), { year: 2024, month: 3, day: 5 }) &&
    eq(mod.parseYmd("1999-12-31"), { year: 1999, month: 12, day: 31 }) &&
    eq(mod.parseYmd("2026-01-01"), { year: 2026, month: 1, day: 1 });
  process.exit(ok ? 0 : 1);
})().catch(() => process.exit(1));
