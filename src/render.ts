// D3/D7 — one self-contained static HTML dashboard: inline CSS, hand-rolled
// SVG, zero external resources. Publishable as-is to GitHub Pages.
import { aggregateDaily, verdict, type DailyPoint, type Verdict } from "./stats.js";
import { wilsonInterval } from "./stats.js";
import type { AttemptRecord } from "./schema.js";

const W = 900;
const H = 320;
const PAD = { left: 50, right: 20, top: 20, bottom: 40 };

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
  const points = daily
    .map(
      (d, i) =>
        `<circle cx="${x(i, n)}" cy="${y(d.rate)}" r="3.5" fill="#0a7d38"><title>${d.day}: ${d.passes}/${d.n} pass (${(d.rate * 100).toFixed(0)}%)</title></circle>`,
    )
    .join("");
  const labels = daily
    .map((d, i) =>
      n <= 20 || i % Math.ceil(n / 15) === 0
        ? `<text x="${x(i, n)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#667">${d.day.slice(5)}</text>`
        : "",
    )
    .join("");
  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (r) =>
        `<line x1="${PAD.left}" y1="${y(r)}" x2="${W - PAD.right}" y2="${y(r)}" stroke="#e3e6ea"/><text x="${PAD.left - 8}" y="${y(r) + 4}" font-size="10" text-anchor="end" fill="#667">${r * 100}%</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily pass rate">
${gridlines}
<polygon class="ci-band" points="${band}" fill="#0a7d38" opacity="0.12"/>
<polyline points="${line}" fill="none" stroke="#0a7d38" stroke-width="2"/>
${points}
${labels}
</svg>`;
}

function verdictBanner(v: Verdict): string {
  const label =
    v.status === "ok" ? "OK" : v.status === "degraded" ? "DEGRADED" : "INSUFFICIENT DATA";
  const cls = v.status.replace("_", "-");
  return `<div class="verdict ${cls}"><strong>${label}</strong><span>${escapeHtml(v.reason)}</span></div>`;
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
        .map((r) => `<i class="dot ${r.outcome}" title="${r.ts.slice(0, 10)}: ${r.outcome}"></i>`)
        .join("");
      const rate = graded.length ? ((passes / graded.length) * 100).toFixed(0) : "–";
      return `<tr><td>${escapeHtml(taskId)}</td><td>${escapeHtml(recs[0]!.task_category)}</td><td>${passes}/${graded.length} (${rate}%)</td><td class="ci">[${(ci.low * 100).toFixed(0)}–${(ci.high * 100).toFixed(0)}%]</td><td>${last10}</td></tr>`;
    })
    .join("\n");
  return `<table><thead><tr><th>Task</th><th>Category</th><th>Pass</th><th>95% CI</th><th>Last 10</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDashboard(records: AttemptRecord[], asOf: Date = new Date()): string {
  const daily = aggregateDaily(records);
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
:root { color-scheme: light; }
body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 960px; padding: 0 1rem; color: #1a2330; }
h1 { font-size: 1.5rem; } h1 .q { color: #667; font-weight: 400; }
.verdict { display: flex; gap: 1rem; align-items: baseline; padding: .8rem 1rem; border-radius: 8px; margin: 1rem 0; }
.verdict.ok { background: #e7f6ec; color: #0a7d38; }
.verdict.degraded { background: #fdeaea; color: #b3261e; }
.verdict.insufficient-data { background: #fff4e0; color: #8a5a00; }
table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #e3e6ea; }
.ci { color: #667; font-variant-numeric: tabular-nums; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 2px; }
.dot.pass { background: #0a7d38; } .dot.fail { background: #b3261e; } .dot.error { background: #c9cdd3; }
footer { margin-top: 2rem; color: #667; font-size: .85rem; }
</style>
</head>
<body>
<h1>vibecheck <span class="q">— is <em>my</em> Claude Code degraded?</span></h1>
${verdictBanner(v)}
<p>${total} attempts · ${daily.length} days · model(s): ${escapeHtml(models)} · generated ${asOf.toISOString().slice(0, 16)}Z</p>
${trendSvg(daily)}
${taskTable(records)}
<footer>Daily pass rate with Wilson 95% CI band. Verdict compares the last 2 days against the trailing 14-day baseline (two-proportion test, α=0.05); with too few attempts it says so instead of guessing. Generated locally by <strong>vibecheck</strong> — keyless, self-hosted, your own subscription and config.</footer>
</body>
</html>
`;
}
