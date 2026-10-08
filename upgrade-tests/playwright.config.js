// Runs the save-upgrade test, which plays every released version of Ms. Menna in order. It takes about 15 minutes.
// Usage: node upgrade-tests/build-versions.js, then npx playwright test --config upgrade-tests/playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  testMatch: 'cookie-chain.spec.js',
  timeout: 60 * 60 * 1000,
  reporter: 'line',
  use: { baseURL: 'http://localhost:8788', headless: true },
  webServer: { command: 'npx serve . -l 8788 --no-clipboard', cwd: '..', url: 'http://localhost:8788', reuseExistingServer: true, timeout: 10000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
