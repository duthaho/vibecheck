# vibecheck

**Is *your* Claude Code degraded? Answered with data, not vibes.**

vibecheck is a keyless, self-hosted quality canary for Claude Code. Every
night (cron), it runs a fixed pack of small, deterministic coding tasks
through **your own Claude Code subscription** — no API key, no external
service — grades the results with plain code (no LLM judge), and renders a
static trend dashboard that tells you, with real statistics, whether your
setup got worse.

## Why, when Marginlab exists

[Marginlab's tracker](https://marginlab.ai/trackers/claude-code/) answers
"is Claude Code degraded *in general*?" — centralized, closed-source, one
clean-room configuration. It cannot answer the question you actually have:

> "Is **my** Claude Code — my subscription, my machine, my setup — worse
> this week?"

vibecheck is the decentralized complement: open source, runs where you
work, measures the product end-to-end the way *you* use it. Your data stays
in a local JSONL file whose schema is deliberately anonymous and
shareable — see [Federation](#federation-roadmap).

## Quickstart

```bash
git clone https://github.com/duthaho/vibecheck && cd vibecheck
npm install && npm run build

# one attempt of the cheapest task, through your logged-in Claude Code:
node dist/cli.js run --task fix-sum-offby1

# the full pack, 3 attempts each (better statistics):
node dist/cli.js run --repeats 3

node dist/cli.js report            # terminal verdict
node dist/cli.js render            # writes dashboard/index.html
```

Requirements: Node ≥ 20 and a machine where `claude` is installed and
logged in (subscription auth is inherited — that's the whole point).

### What a verdict means

- **OK** — the last 2 days are statistically compatible with your trailing
  14-day baseline (two-proportion test, α = 0.05).
- **DEGRADED** — the recent pass rate is significantly *below* baseline.
- **INSUFFICIENT DATA** — not enough graded attempts to say (≥8 recent and
  ≥20 baseline required). vibecheck says this instead of guessing; daily
  pass rates always carry Wilson 95% intervals.

Harness errors (timeouts, SDK failures) are recorded but **excluded** from
pass rates — a broken harness must never masquerade as a dumber model.

## Nightly cron

```cron
# every night at 02:30 — a full pack run plus a fresh dashboard
30 2 * * * cd /path/to/vibecheck && node dist/cli.js run --repeats 3 && node dist/cli.js render >> canary.log 2>&1
```

Each full run (7 tasks × 3 repeats) takes roughly 20–40 minutes of agent
time on your subscription. Start with `--repeats 1` if you're tight on
usage limits.

## Publishing the dashboard (GitHub Pages)

`dashboard/index.html` is fully self-contained — no JS frameworks, no CDN.

```bash
node dist/cli.js render --out docs/index.html
git add docs/index.html && git commit -m "Update dashboard" && git push
# GitHub repo → Settings → Pages → deploy from branch, /docs folder
```

Commit it nightly from cron and you have a public, auto-updating canary.

## The task pack

7 starter tasks across three categories, each graded by a deterministic
script (exit 0 = pass) that inspects the final workspace state:

| Category | Tasks | Grades |
|---|---|---|
| code-fix | `fix-sum-offby1`, `fix-date-parse`, `fix-lru-recency` | fixture tests pass |
| instruction-following | `follow-csv-report`, `follow-json-config` | exact output match |
| tool-use | `tool-sha-manifest`, `tool-log-count` | recomputed artifact match |

### Writing your own task

A task is a folder in `tasks/`:

```
tasks/my-task/
  task.json      # id (= folder name), category, prompt, allowedTools,
                 # maxTurns, timeoutMs, grade.command
  fixtures/      # copied into a fresh temp workspace for each attempt
  grade.cjs      # referenced as "node $TASK_DIR/grade.cjs"
```

Rules the test suite enforces:

- The grader runs with `cwd` = the agent's workspace, but grader files stay
  in the task dir (`$TASK_DIR`) — the agent can never edit its own judge.
- The grader **must fail on pristine fixtures**. A task that passes with no
  agent work measures nothing (`src/packsanity.test.ts` checks every task).
- Grading is a pure check over the final workspace state — deterministic,
  no LLM judge.

The pack's content hash rides along in every record, so mixing pack
versions can never silently corrupt your trends.

## Record schema (v1)

One JSON line per attempt in `results/results.jsonl`:

```json
{"schema_version":1,"run_id":"…","ts":"2026-08-08T02:31:04Z","runner_id":"a1b2c3d4e5f6a7b8",
 "harness_version":"0.1.0","task_pack_hash":"…","task_id":"fix-sum-offby1",
 "task_category":"code-fix","model":"claude-opus-5[1m]","claude_code_version":"2.1.226",
 "outcome":"pass","duration_ms":48000,"num_turns":4,"config_fingerprint":null}
```

By design it contains **no prompts, no outputs, no PII** — `runner_id` is a
random one-time hash, not derived from your machine.

## Federation roadmap

One runner's nightly sample is honest but statistically thin — that is
exactly the criticism the centralized trackers face too. The schema above
is federation-ready on purpose: records from many self-hosted runners can
be pooled as-is, and pooled daily N in the hundreds turns weak per-user
signals into strong community ones. A voluntary aggregation endpoint is the
v1 goal — **not built yet**, and gated on the ToS question below.

## Terms-of-service note

Automated benchmark use of a consumer subscription seat is a gray area
that Anthropic has not (to our knowledge) explicitly ruled on. vibecheck
v0 is deliberately personal-scale: one short nightly run on your own
account, comparable to normal daily usage. Review your plan's terms before
cranking `--repeats`, and treat any future federation participation as
opt-in only. If Anthropic publishes guidance, this section will follow it.

## Development

```bash
npm test        # 63 tests, all offline (the SDK is replayed from a captured fixture)
npm run build
```

MIT.
