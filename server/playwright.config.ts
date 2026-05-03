import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'reports/playwright-html' }]],
  outputDir: 'reports/playwright-traces',
  globalSetup: './tests/e2e/_setup/globalSetup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], storageState: path.join('.test-state', 'admin.json') },
      testMatch: ['**/*.admin.spec.ts'],
    },
    {
      name: 'guest',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/*.guest.spec.ts'],
    },
  ],
  webServer: {
    command: 'NODE_ENV=production npm run start -- -p 3000 -H 127.0.0.1',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
