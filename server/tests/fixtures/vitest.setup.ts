import { beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(__dirname, '../..');
const TEST_DB = path.join(ROOT, 'test.db');

process.env.DATABASE_URL = `file:${TEST_DB}`;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-32chars-minimum-1234567890';
process.env.NODE_ENV = 'test';

beforeAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  execSync('npx prisma migrate deploy', {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
  });
});

afterAll(() => {
  // Keep test.db for inspection on failure; recreated each run.
});
