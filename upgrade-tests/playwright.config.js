// Runs the save-upgrade tests for Ms. Menna. cookie-chain plays every released version in order (about 15 minutes);
// cookie-fixtures uses the cookies it kept (about 5 minutes). Usage: npx playwright test --config upgrade-tests/playwright.config.js cookie-fixtures
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 60 * 60 * 1000,
  reporter: 'line',
  use: { baseURL: 'http://localhost:8788', headless: true },
  webServer: { command: 'npx serve . -l 8788 --no-clipboard', cwd: '..', url: 'http://localhost:8788', reuseExistingServer: true, timeout: 10000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
