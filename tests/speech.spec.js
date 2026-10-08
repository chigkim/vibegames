// @ts-check
// Ms. Menna's voice (libs/speech.js) in both Ms. Menna games. The browser's
// speech engine is replaced with a fake that records what would be said.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // finish() plays the browser saying it is done with the line being said.
    const log = { spoken: [], cancels: 0, current: null, finish() { if (log.current) log.current.dispatchEvent(new Event('end')); } };
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
        log.current = utt;
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

test.describe('Math with Ms. Menna (multiplication-ms-menna.html)', () => {
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
      Speech.clean('Grrr! Tug of war! 💪'),
    ]);
    expect(words).toEqual(['7 times 8 equals 56!', 'Yay! plus 5 cents for you!', 'I have 12 gems. Press check!', 'Ruff ruff! Tug of war!']);
  });

  test('reads the question in the best voice on the device', async ({ page }) => {
    await page.locator('#pathBtn').click();
    const a = await page.locator('#factorA').innerText();
    const b = await page.locator('#factorB').innerText();
    await expect.poll(() => spoken(page)).toContainEqual(expect.stringContaining(`${a} times ${b}?`));
    const last = await page.evaluate(() => window.__speech.spoken.at(-1));
    expect(last).toMatchObject({ voice: 'Ava (Premium)', rate: 0.95, pitch: 1.15 });
    expect(last.text).not.toMatch(/[×🐾]/u);
  });

  test('reads the speech bubble but skips gameplay instructions', async ({ page }) => {
    // Each new line cuts off the last one, so say them one at a time.
    const sayAndHear = async (bubble, text, extra) => {
      await page.evaluate(([b, t, x]) => { window.__speech.spoken.length = 0; say(b, t, x); }, [bubble, text, extra]);
      await page.waitForTimeout(150);
      return spoken(page);
    };
    expect(await sayAndHear('startBubble', 'Woof! Pick your number!')).toEqual(['Woof!']);
    expect(await sayAndHear('startBubble', 'Tap my things to play! 🐾')).toEqual([]);
    expect(await sayAndHear('gameBubble', 'Let\'s multiply! Type your answer.', '6 times 7?')).toEqual(['Let\'s multiply! 6 times 7?']);
    expect(await sayAndHear('startBubble', 'Yay! My new Bed! 🐾')).toEqual(['Yay! My new Bed!']);
    expect(await sayAndHear('houseBubble', 'Let\'s pick an outfit! 🎀')).toEqual(['Let\'s pick an outfit!']);
    await expect(page.locator('#startBubble')).toHaveText('Yay! My new Bed! 🐾');
    expect(await sayAndHear('startBubble', 'That costs $0.50. Yay!')).toEqual(['That costs $0.50. Yay!']);
  });

  test('a bubble with only instructions stops the last line', async ({ page }) => {
    await page.evaluate(() => say('startBubble', 'Woof!'));
    const before = await page.evaluate(() => window.__speech.cancels);
    await page.evaluate(() => say('startBubble', 'Tap my things to play!'));
    expect(await page.evaluate(() => window.__speech.cancels)).toBeGreaterThan(before);
  });

  test('the game script uses no regex lookbehind, which Safari before 16.4 cannot parse', async ({ page }) => {
    const scripts = await page.evaluate(() => [...document.scripts].map(s => s.textContent).join('\n'));
    expect(scripts).not.toMatch(/\(\?<[=!]/);
  });

  test('stops talking when the child starts typing', async ({ page }) => {
    await page.locator('#pathBtn').click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.__speech.cancels);
    await page.keyboard.type('1');
    expect(await page.evaluate(() => window.__speech.cancels)).toBeGreaterThan(before);
  });

  test('an `after` line waits for the line being said to finish', async ({ page }) => {
    await page.evaluate(() => { Speech.speak('Pawsome!'); Speech.speak('Next one! 6 times 7?', { after: true }); });
    await page.waitForTimeout(400);
    expect(await spoken(page)).toEqual(['Pawsome!']);
    const cancels = await page.evaluate(() => window.__speech.cancels);
    await page.evaluate(() => window.__speech.finish());
    await expect.poll(() => spoken(page)).toEqual(['Pawsome!', 'Next one! 6 times 7?']);
    expect(await page.evaluate(() => window.__speech.cancels)).toBe(cancels); // the praise was not cut off
  });

  test('only the newest waiting line is said, and typing drops it', async ({ page }) => {
    await page.evaluate(() => { Speech.speak('One'); Speech.speak('Two', { after: true }); Speech.speak('Three', { after: true }); });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__speech.finish());
    await expect.poll(() => spoken(page)).toEqual(['One', 'Three']);

    await page.evaluate(() => { window.__speech.spoken.length = 0; Speech.speak('Woof!'); });
    await page.waitForTimeout(100);
    await page.evaluate(() => { Speech.speak('Four', { after: true }); Speech.stop(); });
    await page.evaluate(() => window.__speech.finish());
    await page.waitForTimeout(600);
    expect(await spoken(page)).toEqual(['Woof!']);
  });

  test('a waiting line still comes if the browser never says the last one is done', async ({ page }) => {
    await page.evaluate(() => { Speech.speak('Yay!'); Speech.speak('Next one!', { after: true }); });
    await expect.poll(() => spoken(page), { timeout: 5000 }).toEqual(['Yay!', 'Next one!']);
  });

  test('the praise is not cut off by the next question', async ({ page }) => {
    await page.locator('#pathBtn').click();
    const a = Number(await page.locator('#factorA').innerText());
    const b = Number(await page.locator('#factorB').innerText());
    const op = await page.locator('#opSign').innerText();
    await page.keyboard.type(String(op === '÷' ? a / b : a * b));
    await page.keyboard.press('Enter');
    await expect(page.locator('#qCounter')).toHaveText(/^1 \//);
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(1);
    const praised = (await spoken(page)).length;
    const cancels = await page.evaluate(() => window.__speech.cancels);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__speech.finish());
    await expect(page.locator('#qCounter')).toHaveText(/^2 \//);
    await expect.poll(async () => (await spoken(page)).length).toBe(praised + 1);
    expect((await spoken(page)).at(-1)).toMatch(/\?$/);
    expect(await page.evaluate(() => window.__speech.cancels)).toBe(cancels);
  });

  test('after a second miss, each step of the picture waits for the last one', async ({ page }) => {
    await page.locator('#pathBtn').click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0); // the first question is said
    await page.evaluate(() => {
      Object.assign(game, { a: 7, b: 8, div: false });
      onWrong(56); onWrong(56);
      window.__speech.spoken.length = 0;
    });
    const cancels = await page.evaluate(() => window.__speech.cancels);
    // The tip is still being said at 3.5 s, so "5 × 8 = 40" waits for it
    await page.waitForTimeout(4000);
    expect(await spoken(page)).toEqual([expect.stringMatching(/^7 is 5 and 2/)]);
    for (const line of ['5 times 8 equals 40!', '2 times 8 equals 16!', '40 plus 16 equals 56!']) {
      await page.evaluate(() => window.__speech.finish());
      await expect.poll(() => spoken(page), { timeout: 6000 }).toContain(line);
    }
    expect(await page.evaluate(() => window.__speech.cancels)).toBe(cancels);
  });

  test('says nothing when muted', async ({ page }) => {
    await page.locator('#muteBtn').click();
    await page.locator('#pathBtn').click();
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

test.describe('Add & Subtract with Ms. Menna', () => {
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
