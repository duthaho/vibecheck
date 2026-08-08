const { pathToFileURL } = require("node:url");
const { join } = require("node:path");

(async () => {
  const { LruCache } = await import(pathToFileURL(join(process.cwd(), "lru.js")).href);
  const c = new LruCache(2);
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // must refresh "a" — so "b" is now the LRU entry
  c.set("c", 3); // evicts "b", not "a"
  const ok =
    c.get("a") === 1 &&
    c.get("b") === undefined &&
    c.get("c") === 3;
  process.exit(ok ? 0 : 1);
})().catch(() => process.exit(1));
