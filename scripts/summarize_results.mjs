#!/usr/bin/env node
// Summarize one or more Vitest JSON result files.
//
// Usage: node scripts/summarize_results.mjs [--write-baseline OUT.json] RESULTS.json [MORE.json ...]
//
// With one file: prints pass/fail counts and the failing tests.
// With several runs of the same suite: also reports flaky tests (passed in
// some runs, failed in others), which a baseline should exclude.
// --write-baseline saves each test's status across the runs ("passed",
// "failed", "skipped" or "flaky") as a compact, committable JSON file.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let baselineOut = null;
if (args[0] === "--write-baseline") {
  baselineOut = args[1];
  args.splice(0, 2);
}
const files = args;
if (files.length === 0) {
  console.error("usage: summarize_results.mjs [--write-baseline OUT.json] RESULTS.json [MORE.json ...]");
  process.exit(1);
}

// test id ("file > full name") -> list of statuses, one per run
const statuses = new Map();
for (const file of files) {
  const report = JSON.parse(readFileSync(file, "utf8"));
  const root = findRoot(report);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failedFiles = [];
  for (const suite of report.testResults ?? []) {
    const rel = path.relative(root, suite.name);
    if (suite.status === "failed" && (suite.assertionResults ?? []).length === 0) {
      // the file itself failed to load (import or setup error)
      failedFiles.push(`${rel}: ${firstLine(suite.message)}`);
    }
    for (const test of suite.assertionResults ?? []) {
      const id = `${rel} > ${test.fullName}`;
      if (!statuses.has(id)) statuses.set(id, []);
      statuses.get(id).push(test.status);
      if (test.status === "passed") passed++;
      else if (test.status === "failed") failed++;
      else skipped++;
    }
  }
  console.log(`${path.basename(file)}: ${passed} passed, ${failed} failed, ${skipped} skipped/todo`);
  if (failedFiles.length) {
    console.log(`  ${failedFiles.length} test files failed to load:`);
    for (const f of failedFiles) console.log(`    ${f}`);
  }
}

const failing = [];
const flaky = [];
for (const [id, runs] of statuses) {
  const failedRuns = runs.filter((s) => s === "failed").length;
  if (failedRuns === 0) continue;
  if (failedRuns === runs.length) failing.push(id);
  else flaky.push(`${id} (failed ${failedRuns}/${runs.length})`);
}
if (failing.length) {
  console.log(`\nFailing in every run (${failing.length}):`);
  for (const id of failing) console.log(`  ${id}`);
}
if (flaky.length) {
  console.log(`\nFlaky (${flaky.length}):`);
  for (const id of flaky) console.log(`  ${id}`);
}

if (baselineOut) {
  const tests = {};
  for (const id of [...statuses.keys()].sort()) {
    const runs = statuses.get(id);
    const kinds = new Set(runs.map((s) => (s === "passed" || s === "failed" ? s : "skipped")));
    tests[id] = kinds.size === 1 ? [...kinds][0] : "flaky";
  }
  writeFileSync(baselineOut, JSON.stringify({ runs: files.map((f) => path.basename(f)), tests }, null, 1) + "\n");
  console.log(`\nWrote baseline for ${Object.keys(tests).length} tests to ${baselineOut}`);
}

function findRoot(report) {
  // Vitest's JSON uses absolute paths; strip the checkout root for readability.
  const first = report.testResults?.[0]?.name ?? "";
  const i = first.search(/\/(apps|packages)\//);
  return i > 0 ? first.slice(0, i) : path.dirname(first);
}

function firstLine(s) {
  return (s ?? "").split("\n").find((l) => l.trim()) ?? "";
}
