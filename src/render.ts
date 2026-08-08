// D3/D7 — one self-contained static HTML dashboard: inline CSS, hand-rolled
// SVG, zero external resources. Publishable as-is to GitHub Pages.
import { aggregateDaily, rollingMean, verdict, type DailyPoint, type Verdict } from "./stats.js";
import { wilsonInterval } from "./stats.js";
import type { AttemptRecord } from "./schema.js";

const W = 900;
const H = 320;
const PAD = { left: 52, right: 20, top: 20, bottom: 40 };

function x(i: number, count: number): number {
  if (count === 1) return PAD.left + (W - PAD.left - PAD.right) / 2;
  return PAD.left + (i * (W - PAD.left - PAD.right)) / (count - 1);
}

function y(rate: number): number {
  return PAD.top + (1 - rate) * (H - PAD.top - PAD.bottom);
}

function trendSvg(daily: DailyPoint[]): string {
  const n = daily.length;
  const band = [
    ...daily.map((d, i) => `${x(i, n)},${y(d.ci.high)}`),
    ...[...daily].reverse().map((d, i) => `${x(n - 1 - i, n)},${y(d.ci.low)}`),
  ].join(" ");
  const line = daily.map((d, i) => `${x(i, n)},${y(d.rate)}`).join(" ");
  const roll = rollingMean(daily, 7);
  const rollLine = roll.map((d, i) => `${x(i, n)},${y(d.rate)}`).join(" ");
  const points = daily
    .map(
      (d, i) =>
        `<circle class="pt" cx="${x(i, n)}" cy="${y(d.rate)}" r="3.5"><title>${escapeHtml(d.day)}: ${d.passes}/${d.n} pass (${(d.rate * 100).toFixed(0)}%)</title></circle>`,
    )
    .join("");
  const labels = daily
    .map((d, i) =>
      n <= 20 || i % Math.ceil(n / 15) === 0
        ? `<text class="axis" x="${x(i, n)}" y="${H - 8}" text-anchor="middle">${escapeHtml(d.day.slice(5))}</text>`
        : "",
    )
    .join("");
  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (r) =>
        `<line class="grid" x1="${PAD.left}" y1="${y(r)}" x2="${W - PAD.right}" y2="${y(r)}"/><text class="axis" x="${PAD.left - 8}" y="${y(r) + 4}" text-anchor="end">${r * 100}%</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily pass rate">
${gridlines}
<polygon class="ci-band" points="${band}"/>
<polyline class="rolling-mean" points="${rollLine}"/>
<polyline class="trend" points="${line}"/>
${points}
${labels}
</svg>`;
}

function verdictBanner(v: Verdict): string {
  const label =
    v.status === "ok" ? "OK" : v.status === "degraded" ? "DEGRADED" : "INSUFFICIENT DATA";
  const cls = v.status.replace("_", "-");
  return `<section class="verdict ${cls}">
<div class="verdict-status">${label}</div>
<div class="verdict-reason">&rarr; ${escapeHtml(v.reason)}</div>
</section>`;
}

function taskTable(records: AttemptRecord[]): string {
  const byTask = new Map<string, AttemptRecord[]>();
  for (const r of records) {
    byTask.set(r.task_id, [...(byTask.get(r.task_id) ?? []), r]);
  }
  const rows = [...byTask.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([taskId, recs]) => {
      const graded = recs.filter((r) => r.outcome !== "error");
      const passes = graded.filter((r) => r.outcome === "pass").length;
      const ci = wilsonInterval(passes, graded.length);
      const last10 = recs
        .slice(-10)
        .map((r) => `<i class="dot ${r.outcome}" title="${escapeHtml(r.ts.slice(0, 10))}: ${r.outcome}"></i>`)
        .join("");
      const rate = graded.length ? ((passes / graded.length) * 100).toFixed(0) : "–";
      return `<tr><td class="task-id">${escapeHtml(taskId)}</td><td class="cat">${escapeHtml(recs[0]!.task_category)}</td><td>${passes}/${graded.length} (${rate}%)</td><td class="ci">[${(ci.low * 100).toFixed(0)}–${(ci.high * 100).toFixed(0)}%]</td><td>${last10}</td></tr>`;
    })
    .join("\n");
  return `<div class="table-wrap"><table><thead><tr><th>task</th><th>category</th><th>pass</th><th>95% ci</th><th>last 10</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDashboard(records: AttemptRecord[], asOf: Date = new Date()): string {
  // Days with only harness errors have no graded attempts — plotting them as
  // 0% would fake a collapse, so they're excluded from the chart.
  const daily = aggregateDaily(records).filter((d) => d.n > 0);
  const v = verdict(records, asOf);
  const models = [...new Set(records.map((r) => r.model))].join(", ") || "–";
  const total = records.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>vibecheck — is my Claude Code degraded?</title>
<style>
/* Hallmark · macrostructure: Workbench · genre: editorial · theme: Terminal
 * tone: technical · anchor hue: phosphor-green 150 · motion: none
 * audience: HN devs · use: read the verdict in 5s, trust the method
 * constraint: fully self-contained (no external fonts/assets — tests enforce) */
:root {
  color-scheme: dark;
  --color-paper:   oklch(17% 0.015 160);
  --color-paper-2: oklch(21% 0.018 160);
  --color-ink:     oklch(88% 0.02 150);
  --color-ink-2:   oklch(62% 0.025 155);
  --color-rule:    oklch(31% 0.02 160);
  --color-accent:  oklch(78% 0.17 150);
  --color-danger:  oklch(68% 0.19 25);
  --color-warn:    oklch(80% 0.13 85);
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --space-2xs: 0.5rem; --space-xs: 0.75rem; --space-sm: 1rem;
  --space-md: 1.5rem;  --space-lg: 2rem;    --space-xl: 3rem;
  --text-xs: 0.75rem; --text-sm: 0.8125rem; --text-md: 0.9375rem; --text-display: clamp(2rem, 6vw, 3.25rem);
  --rule-hair: 1px solid var(--color-rule);
}
html, body { overflow-x: clip; }
body {
  font-family: var(--font-mono);
  font-size: var(--text-md);
  line-height: 1.6;
  background: var(--color-paper);
  color: var(--color-ink);
  margin: 0 auto;
  max-width: 62rem;
  padding: var(--space-xl) var(--space-md) var(--space-lg);
}
header { margin-bottom: var(--space-lg); }
.wordmark {
  font-size: var(--text-md);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.wordmark .cursor { color: var(--color-accent); }
.prompt {
  color: var(--color-ink-2);
  margin-top: var(--space-2xs);
}
.prompt .ps1 { color: var(--color-accent); }
.verdict {
  border-left: 3px solid var(--color-rule);
  background: var(--color-paper-2);
  padding: var(--space-sm) var(--space-md);
  margin: var(--space-md) 0;
  overflow-wrap: anywhere;
}
.verdict-status {
  font-size: var(--text-display);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.verdict-reason { color: var(--color-ink-2); margin-top: var(--space-2xs); }
.verdict.ok { border-left-color: var(--color-accent); }
.verdict.ok .verdict-status { color: var(--color-accent); }
.verdict.degraded { border-left-color: var(--color-danger); }
.verdict.degraded .verdict-status { color: var(--color-danger); }
.verdict.insufficient-data { border-left-color: var(--color-warn); }
.verdict.insufficient-data .verdict-status { color: var(--color-warn); }
.meta { color: var(--color-ink-2); font-size: var(--text-sm); margin: 0 0 var(--space-md); }
.panel {
  border: var(--rule-hair);
  padding: var(--space-sm) var(--space-sm) var(--space-2xs);
  margin-bottom: var(--space-lg);
}
.panel-title {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-ink-2);
  margin-bottom: var(--space-xs);
}
.panel-title .key-roll { color: var(--color-ink-2); }
.panel-title .key-line { color: var(--color-accent); }
svg { width: 100%; height: auto; display: block; }
svg .grid { stroke: var(--color-rule); }
svg .axis { fill: var(--color-ink-2); font-family: var(--font-mono); font-size: 10px; }
svg .ci-band { fill: var(--color-accent); opacity: 0.13; }
svg .rolling-mean { fill: none; stroke: var(--color-ink-2); stroke-width: 1.5; stroke-dasharray: 5 4; opacity: 0.8; }
svg .trend { fill: none; stroke: var(--color-accent); stroke-width: 2; }
svg .pt { fill: var(--color-accent); stroke: var(--color-paper); stroke-width: 1; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: var(--text-sm); }
th {
  text-align: left;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-ink-2);
  font-weight: 400;
  padding: var(--space-2xs) var(--space-xs);
  border-bottom: var(--rule-hair);
}
td { padding: var(--space-2xs) var(--space-xs); border-bottom: var(--rule-hair); }
.task-id { color: var(--color-ink); font-weight: 700; }
.cat, .ci { color: var(--color-ink-2); font-variant-numeric: tabular-nums; }
.dot { display: inline-block; width: 8px; height: 8px; margin-right: 3px; }
.dot.pass { background: var(--color-accent); }
.dot.fail { background: var(--color-danger); }
.dot.error { background: var(--color-rule); }
footer {
  margin-top: var(--space-xl);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: 1.7;
}
footer p { margin: 0 0 var(--space-2xs); }
footer .hash { color: var(--color-accent); }
footer a { color: var(--color-ink); text-decoration-color: var(--color-accent); }
footer a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (max-width: 480px) {
  body { padding: var(--space-md) var(--space-sm); }
  .verdict { padding: var(--space-xs) var(--space-sm); }
}
</style>
</head>
<body>
<header>
<div class="wordmark">vibecheck<span class="cursor">&#9614;</span></div>
<div class="prompt"><span class="ps1">$</span> is <em>my</em> Claude Code degraded?</div>
</header>
${verdictBanner(v)}
<p class="meta">${total} attempts &middot; ${daily.length} days &middot; model: ${escapeHtml(models)} &middot; generated ${escapeHtml(asOf.toISOString().slice(0, 16))}Z</p>
<section class="panel">
<div class="panel-title">pass rate &mdash; <span class="key-line">daily</span> &middot; <span class="key-roll">--- rolling 7d</span> &middot; band = wilson 95% ci</div>
${trendSvg(daily)}
</section>
${taskTable(records)}
<footer>
<p><span class="hash">#</span> verdict compares the last 2 days against the trailing 14-day baseline (two-proportion test, &alpha;=0.05).</p>
<p><span class="hash">#</span> too few attempts &rarr; it says INSUFFICIENT DATA instead of guessing. harness errors never count against the model.</p>
<p><span class="hash">#</span> generated locally by vibecheck &mdash; keyless, self-hosted, your own subscription and config.</p>
</footer>
</body>
</html>
`;
}
