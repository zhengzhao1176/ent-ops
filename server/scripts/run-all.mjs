#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RUN_ID = process.env.RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const RUN_DIR = path.join(ROOT, 'reports', 'runs', RUN_ID);
const LATEST = path.join(ROOT, 'reports', 'latest');
const FAILURE_DIR = path.join(ROOT, 'reports', 'failures');

fs.mkdirSync(RUN_DIR, { recursive: true });
fs.mkdirSync(FAILURE_DIR, { recursive: true });
try { fs.unlinkSync(LATEST); } catch {}
try { fs.symlinkSync(RUN_DIR, LATEST, 'dir'); } catch {}

const meta = {
  run_id: RUN_ID,
  started_at: new Date().toISOString(),
  cwd: ROOT,
  node: process.version,
  git: tryRun('git rev-parse HEAD').trim(),
  branch: tryRun('git branch --show-current').trim(),
};
fs.writeFileSync(path.join(RUN_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

const PHASES = [
  { name: 'unit',        cmd: ['npx', 'vitest', 'run', 'tests/unit', '--reporter=json', `--outputFile=${path.join(RUN_DIR, 'vitest-unit.json')}`] },
  { name: 'integration', cmd: ['npx', 'vitest', 'run', 'tests/integration', '--reporter=json', `--outputFile=${path.join(RUN_DIR, 'vitest-integration.json')}`] },
  { name: 'e2e',         cmd: ['npx', 'playwright', 'test', '--reporter=json'], stdoutFile: path.join(RUN_DIR, 'playwright.json') },
];

const continueOnFail = process.argv.includes('--continue-on-fail');
const skipE2E = process.argv.includes('--skip-e2e');

let firstFail = null;
for (const phase of PHASES) {
  if (phase.name === 'e2e' && skipE2E) {
    console.log(`[run-all] skipping ${phase.name} (--skip-e2e)`);
    continue;
  }
  if (firstFail && !continueOnFail) {
    console.log(`[run-all] STOP after ${firstFail} failure (use --continue-on-fail to continue)`);
    break;
  }
  console.log(`[run-all] === ${phase.name} ===`);
  const opts = { cwd: ROOT, stdio: 'inherit', env: { ...process.env, RUN_ID } };
  let result;
  if (phase.stdoutFile) {
    const r = spawnSync(phase.cmd[0], phase.cmd.slice(1), { cwd: ROOT, env: opts.env });
    fs.writeFileSync(phase.stdoutFile, r.stdout ?? '');
    fs.appendFileSync(path.join(RUN_DIR, 'stdout.log'), `\n=== ${phase.name} stderr ===\n${(r.stderr ?? '').toString()}\n`);
    result = r;
    process.stdout.write(r.stdout ?? '');
    process.stderr.write(r.stderr ?? '');
  } else {
    result = spawnSync(phase.cmd[0], phase.cmd.slice(1), opts);
  }
  if (result.status !== 0) {
    firstFail = phase.name;
    console.log(`[run-all] phase "${phase.name}" failed with code ${result.status}`);
  }
}

// Slice failures
sliceFailures(RUN_DIR, FAILURE_DIR);

// Print dashboard
printDashboard(RUN_DIR, FAILURE_DIR);

if (firstFail && !continueOnFail) process.exit(1);

function tryRun(cmd) {
  try { return execSync(cmd, { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] }).toString(); }
  catch { return ''; }
}

function sliceFailures(runDir, failureDir) {
  const idxPath = path.join(failureDir, '_index.json');
  const cards = [];
  // Vitest
  for (const file of ['vitest-unit.json', 'vitest-integration.json']) {
    const p = path.join(runDir, file);
    if (!fs.existsSync(p)) continue;
    let report;
    try { report = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    const tests = report.testResults ?? [];
    for (const tr of tests) {
      const file = tr.name ?? tr.filepath ?? 'unknown';
      const tk = file.includes('integration') ? 'integration' : 'unit';
      for (const t of tr.assertionResults ?? []) {
        if (t.status !== 'failed') continue;
        const card = mkCard({
          kind: tk, file, line: 0, name: t.fullName ?? t.title,
          expected: t.failureMessages?.[0]?.split('\n').find((l) => /Expected/i.test(l)) ?? '',
          actual: '',
          stack: (t.failureMessages?.[0] ?? '').split('\n').filter((l) => l.includes('/server/src/')).slice(0, 3),
        });
        cards.push(card);
      }
    }
  }
  // Playwright
  const ppath = path.join(runDir, 'playwright.json');
  if (fs.existsSync(ppath)) {
    try {
      const pr = JSON.parse(fs.readFileSync(ppath, 'utf8'));
      walkPw(pr.suites ?? [], cards);
    } catch {}
  }
  // Write cards
  for (const c of cards) {
    const dir = path.join(failureDir, c.feature ?? 'UNKNOWN');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, c.card_id + '.card.json'), JSON.stringify(c, null, 2));
  }
  fs.writeFileSync(idxPath, JSON.stringify({ open: cards.map((c) => c.card_id), count: cards.length, run_id: path.basename(runDir) }, null, 2));
}

function walkPw(suites, cards) {
  for (const s of suites) {
    for (const sp of s.specs ?? []) {
      for (const t of sp.tests ?? []) {
        for (const r of t.results ?? []) {
          if (r.status === 'failed' || r.status === 'timedOut') {
            cards.push(mkCard({
              kind: 'e2e', file: sp.file ?? s.file ?? 'unknown',
              line: sp.line ?? 0, name: sp.title,
              expected: '', actual: r.error?.message ?? '', stack: [],
            }));
          }
        }
      }
    }
    walkPw(s.suites ?? [], cards);
  }
}

function mkCard({ kind, file, line, name, expected, actual, stack }) {
  const slug = (s) => String(s ?? '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60);
  const fileId = slug(file.split('/').slice(-1)[0]);
  const cardId = `${kind}__${fileId}__${slug(name)}`;
  return {
    card_id: cardId,
    feature: extractFeature(name),
    kind,
    test: { file, line, name },
    failure: { expected, actual, stack_trim: stack },
    context: {
      suspect_files: guessSuspect(kind, file, name),
      frozen_files: ['src/contracts/**', 'prisma/schema.prisma', 'tests/**'],
    },
  };
}

function extractFeature(name) {
  const m = String(name ?? '').match(/F-[A-Z]{2}-\d{2}/);
  return m ? m[0] : 'UNKNOWN';
}

function guessSuspect(kind, testFile, testName) {
  if (kind === 'unit') {
    const m = testName.match(/[a-zA-Z][\w.]+/g) ?? [];
    return m.slice(0, 3).map((x) => `src/server/services/${x}.ts`);
  }
  if (kind === 'integration') {
    const tail = testFile.split('/').slice(-1)[0].replace('.test.ts', '');
    return [`src/server/routers/${tail}.router.ts`, `src/server/services/${tail}.service.ts`];
  }
  if (kind === 'e2e') {
    const tail = testFile.split('/').slice(-1)[0].replace(/\.\w+\.spec\.ts/, '');
    return [`src/app/**/${tail}/**`, `src/components/**`];
  }
  return [];
}

function printDashboard(runDir, failureDir) {
  const idx = JSON.parse(fs.readFileSync(path.join(failureDir, '_index.json'), 'utf8'));
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Run-${path.basename(runDir)}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Open failure cards: ${idx.count}`);
  if (idx.count > 0) {
    console.log('  Recent:');
    for (const id of idx.open.slice(0, 10)) console.log('   - ' + id);
  }
  console.log('═══════════════════════════════════════════════════════════\n');
}
