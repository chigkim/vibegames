// @ts-check
// Smoke tests for every game: loads cleanly, starts, runs, draws, and its
// version badge matches the card on the home page.
const { test, expect } = require('@playwright/test');

// Speech off: with no speechSynthesis, Ms. Menna stays silent. tests/speech.spec.js uses a silent fake instead.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }));
});

// Browser-level passive-listener warning — not a game bug
const IGNORED = /preventDefault inside passive/;

const GAMES = [
  {
    file: 'rise.html',
    canvas: true,
    start: async page => { await page.locator('#btn-start').click(); },
    started: async page => { await expect(page.locator('#hud')).not.toHaveClass(/hidden/); },
    play: async page => { await page.locator('canvas').click(); },
  },
  {
    file: 'flappy-birdie.html',
    canvas: true,
    start: async page => { await page.locator('#ov-btn').click(); },
    started: async page => { await expect(page.locator('#overlay')).toBeHidden(); },
    play: async page => { await page.locator('canvas').click(); },
  },
  {
    file: 'hero-rescue.html',
    canvas: true,
    start: async page => { await page.locator('#btn-amb').click(); },
    started: async page => { await expect(page.locator('#picker')).toBeHidden(); },
    // Drag the on-screen joystick (NippleJS) up and to the right
    play: async page => {
      const box = await page.locator('#joystick-zone').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + box.width / 3, cy - box.height / 3, { steps: 5 });
      await page.waitForTimeout(300);
      await page.mouse.up();
    },
  },
  {
    file: 'ms-menna-math.html',
    canvas: false,
    start: async page => { await page.getByRole('button', { name: /Let's Learn/ }).click(); },
    started: async page => { await expect(page.locator('#gameScreen')).toHaveClass(/active/); },
    play: async page => { await page.locator('.numpad-btn', { hasText: /^1$/ }).first().click(); },
  },
  {
    file: 'multiplication-ms-menna.html',
    canvas: false,
    start: async page => {
      await page.locator('#pathBtn').click();
    },
    started: async page => { await expect(page.locator('#gameScreen')).toHaveClass(/active/); },
    play: async page => { await page.locator('#numpad button').first().click(); },
  },
];

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  return () => errors.filter(e => !IGNORED.test(e));
}

// Reads "v{N} - Updated ..." from text, tolerating &nbsp; around the dash
function versionIn(text) {
  const m = text.replace(/\u00a0/g, ' ').match(/v(\d+)\s*-\s*Updated/);
  return m ? Number(m[1]) : null;
}

for (const game of GAMES) {
  test.describe(game.file, () => {
    test('loads without JS errors', async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto('/' + game.file);
      await page.waitForLoadState('networkidle');
      expect(errors()).toEqual([]);
    });

    test('starts and plays for 1.5s without JS errors', async ({ page }) => {
      const errors = trackErrors(page);
      await page.goto('/' + game.file);
      await game.start(page);
      await game.started(page);
      await game.play(page);
      await page.waitForTimeout(1500);
      expect(errors()).toEqual([]);
    });

    if (game.canvas) {
      test('canvas is sized and draws a scene', async ({ page }) => {
        await page.goto('/' + game.file);
        await game.start(page);
        await page.waitForTimeout(500);
        const canvas = page.locator('canvas');
        await expect(canvas).toBeVisible();
        const box = await canvas.boundingBox();
        expect(box.width).toBeGreaterThan(100);
        expect(box.height).toBeGreaterThan(100);
        // A blank or single-colour canvas compresses to a tiny PNG
        const png = await canvas.screenshot();
        expect(png.length).toBeGreaterThan(10000);
      });
    }

    test('version badge matches the home page card', async ({ page }) => {
      await page.goto('/index.html');
      const card = page.locator(`a.game-card[href="${game.file}"] h3`);
      const expected = versionIn(await card.innerText());
      expect(expected).not.toBeNull();

      await page.goto('/' + game.file);
      expect(versionIn(await page.locator('body').innerText())).toBe(expected);
    });
  });
}
