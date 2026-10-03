// @ts-check
// Ms. Menna's voice (libs/speech.js) in both Ms. Menna games. The browser's
// speech engine is replaced with a fake that records what would be said.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log = { spoken: [], cancels: 0 };
    window.__speech = log;
    class FakeUtterance extends EventTarget {
      constructor(text) { super(); this.text = text; }
    }
    const voices = [
      { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English', default: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha', default: false },
    ];
    const synth = {
      onvoiceschanged: null,
      speaking: false,
      paused: false,
      getVoices: () => voices,
      speak(utt) {
        if (!utt.text.trim()) return; // the silent iOS unlock
        log.spoken.push({ text: utt.text, voice: utt.voice && utt.voice.name, rate: utt.rate, pitch: utt.pitch });
        setTimeout(() => utt.dispatchEvent(new Event('start')), 0);
      },
      cancel() { log.cancels++; },
      pause() {},
      resume() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth });
    window.SpeechSynthesisUtterance = /** @type {any} */ (FakeUtterance);
  });
});

const spoken = page => page.evaluate(() => window.__speech.spoken.map(s => s.text));

test.describe('Multiplication with Ms. Menna', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/multiplication-ms-menna.html');
    await page.evaluate(() => {
      localStorage.clear();
      document.cookie = 'mennaMult=; max-age=0; path=/';
    });
    await page.reload();
  });

  test('turns symbols into words and drops emoji', async ({ page }) => {
    const words = await page.evaluate(() => [
      Speech.clean('7 × 8 = 56! 🐾'),
      Speech.clean('Yay! +5¢ for you! ⭐'),
      Speech.clean('I have 12 💎. Press ✓!'),
    ]);
    expect(words).toEqual(['7 times 8 equals 56!', 'Yay! plus 5 cents for you!', 'I have 12 gems. Press check!']);
  });

  test('reads the question in the Ms. Menna voice', async ({ page }) => {
    await page.locator('#picker .pick-btn').nth(11).click();
    await page.locator('#startBtn').click();
    const a = await page.locator('#factorA').innerText();
    const b = await page.locator('#factorB').innerText();
    await expect.poll(() => spoken(page)).toContainEqual(expect.stringContaining(`${a} times ${b}?`));
    const last = await page.evaluate(() => window.__speech.spoken.at(-1));
    expect(last).toMatchObject({ voice: 'Samantha', rate: 0.95, pitch: 1.15 });
    expect(last.text).not.toMatch(/[×🐾]/u);
  });

  test('stops talking when the child starts typing', async ({ page }) => {
    await page.locator('#picker .pick-btn').nth(11).click();
    await page.locator('#startBtn').click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.__speech.cancels);
    await page.keyboard.type('1');
    expect(await page.evaluate(() => window.__speech.cancels)).toBeGreaterThan(before);
  });

  test('says nothing when muted', async ({ page }) => {
    await page.locator('#muteBtn').click();
    await page.locator('#picker .pick-btn').nth(11).click();
    await page.locator('#startBtn').click();
    await page.waitForTimeout(300);
    expect(await spoken(page)).toEqual([]);
  });
});

test.describe('Math with Ms. Menna', () => {
  test('greets the child by name and reads the question', async ({ page }) => {
    await page.goto('/ms-menna-math.html');
    await page.locator('#nameInput').fill('Ava');
    await page.getByRole('button', { name: /Let's Learn/ }).click();
    await expect.poll(() => spoken(page)).toContainEqual(expect.stringMatching(/^Hi Ava! I am Ms\. Menna.*\d+ (plus|minus) \d+ equals/));
    const texts = await spoken(page);
    expect(texts.join(' ')).not.toMatch(/[⭐🐾🌟🎯💪]/u);
  });
});
