import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(__dirname, '../../..');
const STATE_DIR = path.join(ROOT, '.test-state');
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default async function globalSetup() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

  // Reset dev.db and seed
  // Prisma SQLite resolves `file:./dev.db` relative to the schema.prisma directory,
  // so the actual DB lives at ROOT/prisma/dev.db (not ROOT/dev.db).
  for (const f of ['dev.db', 'dev.db-journal']) {
    const p = path.join(ROOT, 'prisma', f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  execSync('npx prisma migrate deploy', { cwd: ROOT, stdio: 'pipe' });
  execSync('npm run prisma:seed', { cwd: ROOT, stdio: 'pipe' });

  // Login admin → save storage state
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.getByTestId('input-loginId').fill('admin');
    await page.getByTestId('input-password').fill('Aa123456');
    await Promise.all([
      page.waitForURL(/\/$/),
      page.getByTestId('btn-login').click(),
    ]);
    await ctx.storageState({ path: path.join(STATE_DIR, 'admin.json') });
  } finally {
    await browser.close();
  }
}
