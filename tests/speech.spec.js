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
      { name: 'Ava (Premium)', lang: 'en-US', voiceURI: 'Ava-premium', default: false },
      { name: 'Daniel', lang: 'en-GB', voiceURI: 'Daniel', default: false },
      { name: 'Bubbles', lang: 'en-US', voiceURI: 'Bubbles', default: false },
      { name: 'Amélie', lang: 'fr-CA', voiceURI: 'Amelie', default: false },
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

  test('reads the question in the best voice on the device', async ({ page }) => {
    await page.locator('#picker .pick-btn[data-n="12"]').click();
    await page.locator('#startBtn').click();
    const a = await page.locator('#factorA').innerText();
    const b = await page.locator('#factorB').innerText();
    await expect.poll(() => spoken(page)).toContainEqual(expect.stringContaining(`${a} times ${b}?`));
    const last = await page.evaluate(() => window.__speech.spoken.at(-1));
    expect(last).toMatchObject({ voice: 'Ava (Premium)', rate: 0.95, pitch: 1.15 });
    expect(last.text).not.toMatch(/[×🐾]/u);
  });

  test('stops talking when the child starts typing', async ({ page }) => {
    await page.locator('#picker .pick-btn[data-n="12"]').click();
    await page.locator('#startBtn').click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.__speech.cancels);
    await page.keyboard.type('1');
    expect(await page.evaluate(() => window.__speech.cancels)).toBeGreaterThan(before);
  });

  test('says nothing when muted', async ({ page }) => {
    await page.locator('#muteBtn').click();
    await page.locator('#picker .pick-btn[data-n="12"]').click();
    await page.locator('#startBtn').click();
    await page.waitForTimeout(300);
    expect(await spoken(page)).toEqual([]);
  });
});

const lastSpoken = page => page.evaluate(() => window.__speech.spoken.at(-1));

test('the picked voice and speed are saved and shared by both games', async ({ page }) => {
  await page.goto('/multiplication-ms-menna.html');
  await page.locator('#voiceBtn').click();
  const picker = page.getByRole('dialog', { name: "Ms. Menna's voice" });
  await expect(picker).toBeVisible();
  // English talking voices only, after the Best voice choice
  await expect(picker.locator('[data-voice]')).toHaveText([/Best voice/, /Ava/, /Daniel/, /Google/, /Samantha/]);

  await picker.getByRole('button', { name: /Samantha/ }).click();
  await expect.poll(() => lastSpoken(page)).toMatchObject({ voice: 'Samantha', rate: 0.95 });
  await picker.getByRole('button', { name: /Slow/ }).click();
  await expect.poll(() => lastSpoken(page)).toMatchObject({ voice: 'Samantha', rate: 0.76 });
  await expect(picker.getByRole('button', { name: /Samantha/ })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(picker).toBeHidden();

  const cookie = (await page.context().cookies()).find(c => c.name === 'mennaVoice');
  expect(JSON.parse(decodeURIComponent(cookie.value))).toMatchObject({ voice: 'Samantha', speed: 'slow' });

  // The cookie copy brings it back if localStorage is cleared, and the other game uses it too.
  await page.evaluate(() => localStorage.removeItem('mennaVoice'));
  await page.goto('/ms-menna-math.html');
  await page.locator('#nameInput').fill('Ava');
  await page.getByRole('button', { name: /Let's Learn/ }).click();
  await expect.poll(() => lastSpoken(page)).toMatchObject({ voice: 'Samantha', rate: 0.76 });

  // Going back to Best voice drops the pick.
  await page.goto('/ms-menna-math.html');
  await page.getByRole('button', { name: /voice and speed/ }).click();
  await page.getByRole('button', { name: /Best voice/ }).click();
  await expect.poll(() => lastSpoken(page)).toMatchObject({ voice: 'Ava (Premium)', rate: 0.76 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mennaVoice')))).toMatchObject({ voice: '', speed: 'slow' });
});

test('a muted game still plays the sample in the picker', async ({ page }) => {
  await page.goto('/multiplication-ms-menna.html');
  await page.locator('#muteBtn').click();
  await page.locator('#voiceBtn').click();
  await page.getByRole('button', { name: /Fast/ }).click();
  await expect.poll(() => lastSpoken(page)).toMatchObject({ voice: 'Ava (Premium)', rate: 1.14 });
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

  test('Enter in the name box starts the game without checking an empty answer', async ({ page }) => {
    await page.goto('/ms-menna-math.html');
    await page.locator('#nameInput').fill('Ava');
    await page.locator('#nameInput').press('Enter');
    await expect(page.locator('#gameScreen')).toHaveClass(/active/);
    await expect.poll(() => spoken(page)).toContainEqual(expect.stringMatching(/^Hi Ava!/));
    expect(await spoken(page)).not.toContain('Pick a number first!');
    await expect(page.locator('#gameBubble')).not.toContainText('Pick a number first');
  });
});
