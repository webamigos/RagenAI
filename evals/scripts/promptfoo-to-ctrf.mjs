#!/usr/bin/env node
/**
 * Converts promptfoo JSON output to CTRF (Common Test Results Format) JSON.
 * Used in CI to feed results into ctrf-io/github-test-reporter.
 *
 * Usage: node evals/scripts/promptfoo-to-ctrf.mjs <input.json> <output.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error(
    "Usage: node promptfoo-to-ctrf.mjs <promptfoo-results.json> <ctrf-output.json>",
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const results = raw.results?.results ?? raw.results ?? [];
const timestamp = raw.createdAt ?? new Date().toISOString();
const startMs = new Date(timestamp).getTime();

const tests = results.map((r) => {
  const name =
    r.vars?.question ??
    r.description ??
    (typeof r.prompt?.raw === "string" ? r.prompt.raw.substring(0, 120) : null) ??
    `test-${r.testIdx}`;

  const status = r.success ? "passed" : "failed";
  const duration = r.latencyMs ?? 0;

  const entry = { name, status, duration };

  if (!r.success) {
    entry.message =
      r.gradingResult?.reason ?? r.error ?? "Assertion failed";
  }

  if (r.score != null) {
    entry.extra = { score: r.score };
  }

  return entry;
});

const passed = tests.filter((t) => t.status === "passed").length;
const failed = tests.filter((t) => t.status === "failed").length;

const ctrf = {
  results: {
    tool: { name: "promptfoo" },
    summary: {
      tests: tests.length,
      passed,
      failed,
      pending: 0,
      skipped: 0,
      other: 0,
      start: startMs,
      stop: startMs + tests.reduce((sum, t) => sum + (t.duration || 0), 0),
    },
    tests,
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(ctrf, null, 2));
console.log(
  `CTRF report written: ${tests.length} tests (${passed} passed, ${failed} failed) -> ${outputPath}`,
);
