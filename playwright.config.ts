import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', outputDir: '.sdk/test-results',
  webServer: process.env.STUDIO_TEST_URL ? undefined : { command: 'npm run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
  use: { baseURL: process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:5174', headless: true, viewport: { width: 1280, height: 850 }, launchOptions: { executablePath: process.env.CHROME_PATH } },
});
