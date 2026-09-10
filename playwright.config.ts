import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:4173/call-me-designer/';
const CACHE_DIR = 'node_modules/.cache/playwright';

export default defineConfig({
  testDir: 'e2e',
  outputDir: `${CACHE_DIR}/test-results`,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
