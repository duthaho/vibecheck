// AC1/D6 — append-only JSONL store. Corrupt lines are skipped loudly, never fatal.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateRecord, type AttemptRecord } from "./schema.js";

export function appendRecords(file: string, records: AttemptRecord[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r) + "\n").join("");
  appendFileSync(file, lines);
}

export function readRecords(file: string): AttemptRecord[] {
  if (!existsSync(file)) return [];
  const out: AttemptRecord[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.warn(`results: skipping corrupt JSON at ${file}:${i + 1}`);
      continue;
    }
    const problems = validateRecord(parsed);
    if (problems.length > 0) {
      console.warn(`results: skipping invalid record at ${file}:${i + 1} (${problems[0]})`);
      continue;
    }
    out.push(parsed as AttemptRecord);
  }
  return out;
}
