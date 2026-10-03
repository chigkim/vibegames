// @ts-check
// Pay table and cash-out for Multiplication with Ms. Menna. The coins are
// exchanged for real money, so earnings and payouts must be exact.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/multiplication-ms-menna.html');
  await page.evaluate(() => {
    localStorage.clear();
    document.cookie = 'mennaMult=; max-age=0; path=/';
  });
  await page.reload();
});

test('easy facts pay less than hard ones', async ({ page }) => {
  const pay = await page.evaluate(() => [
    [1, 9], [9, 1], [2, 3], [13, 2], [10, 7], [3, 10], [3, 3], [4, 12], [5, 5],
    [6, 6], [7, 8], [6, 12], [12, 13], [11, 11],
  ].map(([a, b]) => centsFor(a, b)));
  expect(pay).toEqual([1, 1, 2, 2, 2, 2, 4, 4, 4, 7, 7, 7, 7, 7]);
});

test('right answer adds the shown pay, wrong answer takes 2¢', async ({ page }) => {
  await page.locator('#picker .pick-btn').nth(11).click(); // up to 12
  await page.locator('#startBtn').click();

  const a = Number(await page.locator('#factorA').innerText());
  const b = Number(await page.locator('#factorB').innerText());
  const cents = await page.evaluate(([x, y]) => centsFor(x, y), [a, b]);
  await expect(page.locator('#worth')).toHaveText(`This one pays ${cents}¢!`);

  await page.keyboard.type(String(a * b));
  await page.keyboard.press('Enter');
  await expect(page.locator('#gameBankAmount')).toHaveText('$' + (cents / 100).toFixed(2));

  await page.waitForTimeout(2000); // next question
  const a2 = Number(await page.locator('#factorA').innerText());
  const b2 = Number(await page.locator('#factorB').innerText());
  await page.keyboard.type(String(a2 * b2 + 1));
  await page.keyboard.press('Enter');
  await expect(page.locator('#gameBankAmount')).toHaveText('$' + (Math.max(0, cents - 2) / 100).toFixed(2));
});

test('cash out pays the full balance, keeps history, and survives reload', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 340; saveState(); });
  await page.reload();

  await page.locator('#cashoutBtn').click();
  await expect(page.locator('#cashoutScreen')).toHaveClass(/active/);
  await expect(page.locator('#cashBankAmount')).toHaveText('$3.40');
  await expect(page.locator('#payoutList')).toContainText('No payouts yet');

  const payBtn = page.locator('#payBtn');
  await expect(payBtn).toHaveText('Pay out $3.40');
  await payBtn.click(); // first tap only asks to confirm
  await expect(page.locator('#cashBankAmount')).toHaveText('$3.40');
  await payBtn.click();

  await expect(page.locator('#cashBankAmount')).toHaveText('$0.00');
  await expect(page.locator('#statPaid')).toHaveText('$3.40');
  await expect(page.locator('#statAllTime')).toHaveText('$3.40');
  await expect(page.locator('.payout-row')).toHaveCount(1);
  await expect(page.locator('.payout-row')).toContainText('$3.40');
  await expect(payBtn).toBeDisabled();

  await page.reload();
  await page.locator('#cashoutBtn').click();
  await expect(page.locator('#statPaid')).toHaveText('$3.40');
  await expect(page.locator('.payout-row')).toHaveCount(1);
  await page.locator('#cashBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
  await expect(page.locator('#startBankAmount')).toHaveText('$0.00');
});

test('piggy bank shows everywhere and fills up as the balance grows', async ({ page }) => {
  await expect(page.locator('.bank .pig svg')).toHaveCount(3);
  await expect(page.locator('#startBank')).toHaveAttribute('data-level', '0');
  for (const [cents, level] of [[5, '1'], [150, '2'], [450, '3'], [700, '4']]) {
    await page.evaluate(c => { state.totalCents = c; renderBank(); }, cents);
    for (const id of ['#startBank', '#gameBank', '#cashBank']) {
      await expect(page.locator(id)).toHaveAttribute('data-level', level);
    }
  }
  // Each pig gets its own clip path so hidden screens don't break the others
  const ids = await page.locator('.bank .pig clipPath').evaluateAll(els => els.map(e => e.id));
  expect(new Set(ids).size).toBe(3);
});

// Answers the current question right (or wrong) and waits for the next one.
async function answer(page, right) {
  await expect(page.locator('#answerDisplay')).toHaveClass(/empty/);
  const a = Number(await page.locator('#factorA').innerText());
  const b = Number(await page.locator('#factorB').innerText());
  await page.evaluate(() => { game.input = ''; });
  await page.keyboard.type(String(a * b + (right ? 0 : 1)));
  await page.keyboard.press('Enter');
  return { a, b };
}

test('Ms. Menna does a trick for 3 right in a row', async ({ page }) => {
  await page.locator('#picker .pick-btn').nth(11).click();
  await page.locator('#startBtn').click();
  for (let i = 0; i < 2; i++) {
    await answer(page, true);
    await expect(page.locator('#pomGame')).not.toHaveClass(/trick-/);
    await page.waitForTimeout(1400);
  }
  await answer(page, true);
  await expect(page.locator('#pomGame')).toHaveClass(/trick-spin/);
  await expect(page.locator('#gameBubble')).toContainText('3 in a row');
});

test('stickers fill in after 3 first-try answers and give medals', async ({ page }) => {
  await page.evaluate(() => {
    state.mastery[FACT_INDEX['3x7']] = 3;
    state.mastery[FACT_INDEX['2x5']] = 1;
    // all facts up to 2 learned -> gold; 3 of the 6 facts up to 3 -> bronze
    for (const k of ['1x1', '1x2', '2x2']) state.mastery[FACT_INDEX[k]] = 3;
    saveState();
  });
  await page.reload();
  await expect(page.locator('#picker .pick-btn').nth(0).locator('.medal')).toHaveText('🥇');
  await expect(page.locator('#picker .pick-btn').nth(1).locator('.medal')).toHaveText('🥇');
  await expect(page.locator('#picker .pick-btn').nth(2).locator('.medal')).toHaveText('🥉');
  await expect(page.locator('#picker .pick-btn').nth(12).locator('.medal')).toHaveCount(0);

  await page.locator('#stickersBtn').click();
  await expect(page.locator('#stickerCount')).toHaveText('4 of 91 stickers');
  // 14×14 grid; 3×7 and 7×3 both show the sticker
  await expect(page.locator('#stickerGrid > div')).toHaveCount(196);
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(6); // 1×1, 2×2, and both halves of 1×2 and 3×7
  await expect(page.locator('#stickerGrid .dots')).toHaveCount(2);
  await page.locator('#stickerBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
});

test('a right answer earns the third dot and a sticker; a wrong one costs a dot', async ({ page }) => {
  await page.locator('#picker .pick-btn').nth(0).click(); // only 1 × 1
  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.locator('#startBtn').click();
  await answer(page, true);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x1']])).toBe(3);
  await expect(page.locator('.banner')).toContainText('New sticker: 1 × 1');

  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.waitForTimeout(1900);
  await answer(page, false);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x1']])).toBe(1);
});

test('a missed fact comes back later in the same round', async ({ page }) => {
  await page.locator('#picker .pick-btn').nth(12).click(); // up to 13
  await page.locator('#startBtn').click();
  const missed = await answer(page, false);
  await page.waitForTimeout(800);
  await answer(page, true); // second try, on question 1
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(2000);
    seen.push(await answer(page, true));
  }
  expect(seen.slice(2).some(q => q.a * q.b === missed.a * missed.b &&
    Math.min(q.a, q.b) === Math.min(missed.a, missed.b))).toBe(true);
});

test('first-try answers earn Pom gems without changing the money', async ({ page }) => {
  await page.locator('#picker .pick-btn').nth(11).click();
  await page.locator('#startBtn').click();
  const { a, b } = await answer(page, true);
  const cents = await page.evaluate(([x, y]) => centsFor(x, y), [a, b]);
  await expect(page.locator('#pomGame .gem-badge')).toHaveText('💎 1');
  await expect(page.locator('#gameBankAmount')).toHaveText('$' + (cents / 100).toFixed(2));

  await page.waitForTimeout(2000);
  await answer(page, false); // wrong answers cost cents, never gems
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => state.gems)).toBe(1);
});

test("Pom's Closet buys, wears, and saves outfits with gems only", async ({ page }) => {
  await page.evaluate(() => { state.gems = 12; state.totalCents = 250; saveState(); });
  await page.reload();
  await expect(page.locator('#pomStart .gem-badge')).toHaveText('💎 12');
  await expect(page.locator('#closetBtn')).toHaveClass(/glow/);
  await page.locator('#closetBtn').click();
  await expect(page.locator('#closetScreen')).toHaveClass(/active/);

  // Too expensive: try it on, but can't buy
  await page.locator('.item[data-id="crown"]').click();
  await expect(page.locator('#buyBtn')).toBeDisabled();
  await expect(page.locator('#buyBtn')).toHaveText('Need 33 more 💎');

  await page.locator('.item[data-id="party"]').click();
  await expect(page.locator('#pomCloset .acc-hat polygon')).toHaveCount(1);
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .gem-badge')).toHaveText('💎 7');
  await expect(page.locator('.item[data-id="party"]')).toHaveClass(/wearing/);

  await page.locator('.closet-tab[data-slot="fur"]').click();
  await page.locator('.item[data-id="choc"]').click();
  await expect(page.locator('#buyBtn')).toBeDisabled();

  // Taking off the hat stays off after reload; money is untouched
  await page.locator('.closet-tab[data-slot="hat"]').click();
  await page.locator('.item[data-id="party"]').click();
  await expect(page.locator('#pomCloset .acc-hat > *')).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(() => ({ gems: state.gems, owned: state.owned, worn: state.worn, cents: state.totalCents }));
  expect(saved).toEqual({ gems: 7, owned: ['party'], worn: { fur: 'classic' }, cents: 250 });

  await page.locator('#closetBtn').click();
  await page.locator('.item[data-id="party"]').click();
  await page.locator('#closetBackBtn').click();
  await expect(page.locator('#pomStart .acc-hat polygon')).toHaveCount(1);
});

test('saved progress still fits in the cookie mirror', async ({ page }) => {
  const size = await page.evaluate(() => {
    FACT_KEYS.forEach(k => { state.weights[k] = 11.55; });
    state.mastery = state.mastery.map(() => 3);
    state.payouts = Array.from({ length: MAX_PAYOUTS_KEPT }, () => ({ t: Date.now(), c: 12345 }));
    state.owned = CLOSET.filter(i => i.price > 0).map(i => i.id);
    state.worn = { hat: 'crown', face: 'hearts', neck: 'medal', back: 'cape', fur: 'pink' };
    state.gems = 99999;
    saveState();
    return encodeURIComponent(localStorage.getItem(STORE_KEY)).length + COOKIE_NAME.length + 1;
  });
  expect(size).toBeLessThan(4096);
});

test('Pom buys toys, plays with them, and uses them in streak tricks', async ({ page }) => {
  await page.evaluate(() => { state.gems = 20; state.totalCents = 90; saveState(); });
  await page.reload();
  await expect(page.locator('#toyShelf')).toBeHidden();

  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="toy"]').click();
  await page.locator('.item[data-id="ball"]').click(); // tries it out first
  await expect(page.locator('#pomCloset')).toHaveClass(/play-ball/);
  await expect(page.locator('#buyBtn')).toHaveText('Buy Bouncy Ball for 10 💎');
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .gem-badge')).toHaveText('💎 10');
  await expect(page.locator('.item[data-id="ball"] .price')).toHaveText('Play! ▶');
  await page.locator('#closetBackBtn').click();

  // Toys sit on the shelf and are never worn
  await expect(page.locator('#toyShelf .toy-btn')).toHaveCount(1);
  await page.locator('#toyShelf .toy-btn').click();
  await expect(page.locator('#pomStart')).toHaveClass(/play-ball/);
  await expect(page.locator('#pomStart .toy-fx')).toHaveCount(1);
  await expect(page.locator('#startBubble')).toContainText('Fetch');
  await page.reload();
  const saved = await page.evaluate(() => ({ gems: state.gems, owned: state.owned, worn: state.worn, cents: state.totalCents }));
  expect(saved).toEqual({ gems: 10, owned: ['ball'], worn: { hat: 'cap', fur: 'classic' }, cents: 90 });

  // spin, flip, dance, then the ball
  const say = await page.evaluate(() => doTrick(6).say(6));
  expect(say).toContain('Fetch');
  await expect(page.locator('#pomGame')).toHaveClass(/play-ball/);
  expect(await page.evaluate(() => doTrick(7).cls)).toBe('trick-spin');
});
