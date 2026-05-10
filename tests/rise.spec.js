// @ts-check
const { test, expect } = require('@playwright/test');

// Ignore this browser-level passive-listener warning — not a game bug
const IGNORED = /preventDefault inside passive/;

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/rise.html');
  page._riseErrors = errors;
});

function fatalErrors(page) {
  return page._riseErrors.filter(e => !IGNORED.test(e));
}

test('page loads without JS errors', async ({ page }) => {
  await page.waitForLoadState('networkidle');
  expect(fatalErrors(page)).toEqual([]);
});

test('canvas is present and sized', async ({ page }) => {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(100);
});

test('ready screen shows on load', async ({ page }) => {
  await expect(page.locator('#screen-ready')).toHaveClass(/active/);
  await expect(page.locator('#btn-start')).toBeVisible();
});

test('game-over screen is hidden on load', async ({ page }) => {
  await expect(page.locator('#screen-gameover')).not.toHaveClass(/active/);
});

test('HUD is hidden before game starts', async ({ page }) => {
  await expect(page.locator('#hud')).toHaveClass(/hidden/);
});

test('clicking start hides ready screen and shows HUD', async ({ page }) => {
  await page.locator('#btn-start').click();
  await expect(page.locator('#screen-ready')).not.toHaveClass(/active/);
  await expect(page.locator('#hud')).not.toHaveClass(/hidden/);
  expect(fatalErrors(page)).toEqual([]);
});

test('render loop runs for 500ms without JS errors (cat draws each frame)', async ({ page }) => {
  await page.locator('#btn-start').click();
  // Let ~30 render frames pass so drawPlayer() has been called many times
  await page.waitForTimeout(500);
  expect(fatalErrors(page)).toEqual([]);
});

test('mute button toggles without error', async ({ page }) => {
  await page.locator('#btn-start').click();  // HUD (and mute btn) only shows after start
  await expect(page.locator('#mute-btn')).toBeVisible();
  await page.locator('#mute-btn').click();
  await page.locator('#mute-btn').click();
  expect(fatalErrors(page)).toEqual([]);
});

test('guide checkbox persists preference', async ({ page }) => {
  const checkbox = page.locator('#ready-guide-toggle');
  const initial = await checkbox.isChecked();
  await checkbox.click();
  await page.reload();
  await expect(page.locator('#ready-guide-toggle')).toBeChecked({ checked: !initial });
  // Restore original value
  await page.locator('#ready-guide-toggle').click();
});

test('version badge shows v18', async ({ page }) => {
  await expect(page.locator('text=v18')).toBeVisible();
});
