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
    [6, 6], [7, 8], [6, 12], [12, 13], [11, 11], [1, 19], [2, 17], [10, 19], [4, 17], [7, 15], [13, 19],
    [16, 18], [19, 19], [0, 0], [0, 19], [13, 0],
  ].map(([a, b]) => centsFor(a, b)));
  expect(pay).toEqual([1, 1, 2, 2, 2, 2, 3, 5, 3, 6, 6, 7, 7, 7, 1, 2, 2, 8, 9, 9, 10, 10, 1, 1, 1]);
  // Every pay from 1¢ to 10¢ is used
  const all = await page.evaluate(() => [...new Set(FACT_KEYS.map(k => centsFor(...k.split('x').map(Number))))]);
  expect(all.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('right answer adds the shown pay, wrong answer takes 2¢', async ({ page }) => {
  await page.locator('#picker .pick-btn[data-n="12"]').click(); // up to 12
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

test('a first wrong answer offers the picture hint', async ({ page }) => {
  await page.locator('#picker .pick-btn[data-n="5"]').click(); // up to 5
  await page.locator('#startBtn').click();
  await expect(page.locator('#hintBtn')).toBeHidden();

  await answer(page, false);
  await expect(page.locator('#hintBtn')).toBeVisible();
  await page.locator('#hintBtn').click({ force: true }); // its glow never stops moving
  await expect(page.locator('#gridArea')).toBeVisible();
  await expect(page.locator('#hintBtn')).toBeHidden();
});

test('a right answer after the picture pays 1¢ whatever the factors', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 50; saveState(); });
  await page.reload();
  await page.locator('#picker .pick-btn[data-n="12"]').click(); // up to 12
  await page.locator('#startBtn').click();

  // Hint button after one miss
  await page.evaluate(() => { game.a = 7; game.b = 8; $('factorA').textContent = 7; $('factorB').textContent = 8; });
  await answer(page, false);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#worth')).toHaveText('With the picture, this one pays 1¢');
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.49'); // 50 − 2 + 1

  // Count-together picture after two misses
  await page.waitForTimeout(2200);
  await page.evaluate(() => { game.a = 9; game.b = 9; $('factorA').textContent = 9; $('factorB').textContent = 9; });
  await answer(page, false);
  await answer(page, false);
  await expect(page.locator('#gridArea')).toBeVisible();
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.46'); // 49 − 2 − 2 + 1
});

test('0 facts come up in rounds, pay 1¢, and the picture shows no dots', async ({ page }) => {
  const zeros = await page.evaluate(() => {
    game = { max: 3, asked: new Set(), prevKey: null };
    let n = 0;
    for (let i = 0; i < 400; i++) { const q = pickQuestion(); if (q.a === 0 || q.b === 0) n++; }
    return n;
  });
  expect(zeros).toBeGreaterThan(40);
  expect(zeros).toBeLessThan(260);

  await page.locator('#picker .pick-btn[data-n="5"]').click();
  await page.locator('#startBtn').click();
  await page.evaluate(() => { game.a = 0; game.b = 7; $('factorA').textContent = 0; $('factorB').textContent = 7; });
  await answer(page, false);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#arrayGrid .zero-note')).toContainText('0');
  await answer(page, true);
  await expect(page.locator('#feedback')).toHaveText('0 × 7 = 0 ✓');
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.01'); // 0 − 2 is floored at 0, then + 1
});

test('a save in another tab is not undone by this tab', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/multiplication-ms-menna.html');
  await other.evaluate(() => { state.totalCents = 500; state.gems = 3; saveState(); });

  await expect(page.locator('#startBankAmount')).toHaveText('$5.00');
  await expect(page.locator('#pomStart .gem-badge')).toHaveText('💎 3');
  await page.evaluate(() => changeBank(7));
  await other.reload();
  await expect(other.locator('#startBankAmount')).toHaveText('$5.07');
  expect(await other.evaluate(() => state.gems)).toBe(3);
});

test('Ms. Menna does a trick for 3 right in a row', async ({ page }) => {
  await page.locator('#picker .pick-btn[data-n="12"]').click();
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
    state.mastery[FACT_INDEX['4x17']] = 3;
    state.mastery[FACT_INDEX['2x5']] = 1;
    // all 10 facts from 0 to 3 learned -> gold; 10 of the 15 facts up to 4 -> silver
    for (const k of ['0x0', '0x1', '0x2', '0x3', '1x1', '1x2', '1x3', '2x2', '2x3', '3x3']) state.mastery[FACT_INDEX[k]] = 3;
    saveState();
  });
  await page.reload();
  await expect(page.locator('#picker .pick-btn')).toHaveCount(17); // 3 to 19
  await expect(page.locator('#picker .pick-btn').first()).toHaveText(/^3/);
  await expect(page.locator('#picker .pick-btn[data-n="3"] .medal')).toHaveText('🥇');
  await expect(page.locator('#picker .pick-btn[data-n="4"] .medal')).toHaveText('🥈');
  await expect(page.locator('#picker .pick-btn[data-n="19"] .medal')).toHaveCount(0);

  await page.locator('#stickersBtn').click();
  await expect(page.locator('#stickerCount')).toHaveText('12 of 210 stickers');
  // 0 to 19 plus headings is a 21×21 grid; 3×7 and 7×3 both show the sticker
  await expect(page.locator('#stickerGrid > div')).toHaveCount(441);
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(20); // 0×0, 1×1, 2×2, 3×3, and both halves of the other 8
  await expect(page.locator('#stickerGrid > div').nth(1)).toHaveText('0');
  await expect(page.locator('#stickerGrid .dots')).toHaveCount(2);
  await page.locator('#stickerBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
});

test('a right answer earns the third dot and a sticker; a wrong one costs a dot', async ({ page }) => {
  await page.locator('#picker .pick-btn[data-n="3"]').click();
  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.locator('#startBtn').click();
  await askOneTimesOne(page);
  await answer(page, true);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x1']])).toBe(3);
  await expect(page.locator('.banner')).toContainText('New sticker: 1 × 1');

  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.waitForTimeout(1900);
  await askOneTimesOne(page);
  await answer(page, false);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x1']])).toBe(1);
});

async function askOneTimesOne(page) {
  await page.evaluate(() => { game.a = 1; game.b = 1; $('factorA').textContent = 1; $('factorB').textContent = 1; });
}

test('a save from v11 (numbers up to 13) keeps every sticker, coin, gem and closet item', async ({ page }) => {
  const old = await page.evaluate(() => {
    const oldKeys = [];
    for (let a = 1; a <= 13; a++) for (let b = a; b <= 13; b++) oldKeys.push(`${a}x${b}`);
    const mastery = oldKeys.map(k => (k === '7x8' || k === '13x13' ? 3 : k === '6x9' ? 2 : 0)).join('');
    const save = {
      totalCents: 437, paidCents: 120, payouts: [{ t: 1, c: 120 }], weights: { '7x8': 5.5, '12x13': 3 },
      mastery, lastMax: 13, muted: false, gems: 9, owned: 'party,choc', worn: { hat: 'party', fur: 'choc' }, savedAt: Date.now(),
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
    return mastery;
  });
  await page.reload();
  const loaded = await page.evaluate(() => ({
    cents: state.totalCents, paid: state.paidCents, gems: state.gems, owned: state.owned, worn: state.worn, lastMax: state.lastMax,
    m78: state.mastery[FACT_INDEX['7x8']], m1313: state.mastery[FACT_INDEX['13x13']], m69: state.mastery[FACT_INDEX['6x9']],
    learned: state.mastery.filter(m => m === 3).length, w78: state.weights['7x8'], w1213: state.weights['12x13'],
  }));
  expect(loaded).toEqual({
    cents: 437, paid: 120, gems: 9, owned: ['party', 'choc'], worn: { hat: 'party', fur: 'choc' }, lastMax: 13,
    m78: 3, m1313: 3, m69: 2, learned: 2, w78: 5.5, w1213: 3,
  });
  await expect(page.locator('#picker .pick-btn[data-n="13"]')).toHaveClass(/selected/);

  // The new save starts with the v11 sticker string, so an old tab still open reads it right
  const saved = await page.evaluate(() => { saveState(); return JSON.parse(localStorage.getItem(STORE_KEY)); });
  expect(saved.mastery.slice(0, 91)).toBe(old);
  expect(saved.mastery).toHaveLength(210);
  await page.reload();
  expect(await page.evaluate(() => [state.weights['7x8'], state.weights['12x13'], state.weights['1x1']])).toEqual([5.5, 3, undefined]);
});

test('a missed fact comes back later in the same round', async ({ page }) => {
  await page.locator('#picker .pick-btn[data-n="13"]').click(); // up to 13
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
  await page.locator('#picker .pick-btn[data-n="12"]').click();
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

  // Tapping an item shows its colors. Too expensive: try it on, but can't buy
  await page.locator('.item[data-id="crown"]').click();
  await expect(page.locator('#colorRow .color-btn')).toHaveCount(11);
  await page.locator('.color-btn[data-id="crown"]').click();
  await expect(page.locator('#buyBtn')).toBeDisabled();
  await expect(page.locator('#buyBtn')).toHaveText('Need 33 more 💎');

  await page.locator('.item[data-id="party"]').click();
  await page.locator('.color-btn[data-id="party"]').click();
  await expect(page.locator('#pomCloset .acc-hat polygon')).toHaveCount(1);
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .gem-badge')).toHaveText('💎 7');
  await expect(page.locator('.item[data-id="party"]')).toHaveClass(/wearing/);
  await expect(page.locator('.color-btn[data-id="party"] .price')).toHaveText('Wearing ✓');

  // A color already bought can't be bought again
  await page.locator('.color-btn[data-id="party"]').click(); // takes it off
  await expect(page.locator('.color-btn[data-id="party"] .price')).toHaveText('✓ Yours');
  await expect(page.locator('#buyBtn')).toBeHidden();
  expect(await page.evaluate(() => { tryingOn = 'party'; buyItem(); return state.gems; })).toBe(7);
  await page.locator('.color-btn[data-id="party"]').click(); // back on

  await page.locator('.closet-tab[data-slot="fur"]').click();
  await page.locator('.item[data-id="choc"]').click();
  await expect(page.locator('#buyBtn')).toBeDisabled();

  // Taking off the hat stays off after reload; money is untouched
  await page.locator('.closet-tab[data-slot="hat"]').click();
  await page.locator('.item[data-id="party"]').click();
  await page.locator('.color-btn[data-id="party"]').click();
  await expect(page.locator('#pomCloset .acc-hat > *')).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(() => ({ gems: state.gems, owned: state.owned, worn: state.worn, cents: state.totalCents }));
  expect(saved).toEqual({ gems: 7, owned: ['party'], worn: { fur: 'classic' }, cents: 250 });

  await page.locator('#closetBtn').click();
  await page.locator('.item[data-id="party"]').click();
  await page.locator('.color-btn[data-id="party"]').click();
  await page.locator('#closetBackBtn').click();
  await expect(page.locator('#pomStart .acc-hat polygon')).toHaveCount(1);
});

test('saved progress still fits in the cookie mirror', async ({ page }) => {
  const size = await page.evaluate(() => {
    FACT_KEYS.forEach(k => { state.weights[k] = 11.55; });
    state.mastery = state.mastery.map(() => 3);
    state.payouts = Array.from({ length: MAX_PAYOUTS_KEPT }, () => ({ t: Date.now(), c: 12345 }));
    state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
    state.worn = { hat: 'crown.s', face: 'hearts', neck: 'medal', back: 'cape', fur: 'pink' };
    state.gems = 99999;
    saveState();
    return encodeURIComponent(localStorage.getItem(STORE_KEY)).length + COOKIE_NAME.length + 1;
  });
  expect(size).toBeLessThan(4096);
});

test('closet colors save compactly, and v12 saves keep their items', async ({ page }) => {
  // A v12 save lists plain item ids
  await page.evaluate(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ gems: 30, owned: 'party,ball,choc', worn: { hat: 'party', fur: 'choc' }, savedAt: Date.now() }));
  });
  await page.reload();
  expect(await page.evaluate(() => ({ owned: state.owned, worn: state.worn, gems: state.gems })))
    .toEqual({ owned: ['party', 'ball', 'choc'], worn: { hat: 'party', fur: 'choc' }, gems: 30 });

  // Buy a rainbow Party Hat and a blue ball
  await page.locator('#closetBtn').click();
  await page.locator('.item[data-id="party"]').click();
  await page.locator('.color-btn[data-id="party.w"]').click();
  await expect(page.locator('#buyBtn')).toHaveText('Buy Rainbow Party Hat for 15 💎');
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .acc-hat polygon')).toHaveAttribute('fill', 'url(#rainbow-pomCloset)');
  await page.locator('.closet-tab[data-slot="toy"]').click();
  await page.locator('.item[data-id="ball"]').click();
  await page.locator('.color-btn[data-id="ball.b"]').click();
  await page.locator('#buyBtn').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(STORE_KEY)).owned);
  expect(saved).toBe('party,party.w,choc,ball,ball.b');

  await page.reload();
  expect(await page.evaluate(() => ({ worn: state.worn, toys: state.toys, gems: state.gems })))
    .toEqual({ worn: { hat: 'party.w', fur: 'choc' }, toys: { ball: 'ball.b' }, gems: 5 });
  await expect(page.locator('#pomStart .acc-hat polygon')).toHaveAttribute('fill', 'url(#rainbow-pomStart)');
  await expect(page.locator('#toyShelf .toy-btn')).toHaveCount(1);
  await expect(page.locator('#toyShelf .toy-btn')).toHaveAttribute('data-id', 'ball.b');
});

test('the IndexedDB copy brings back progress if localStorage and the cookie are cleared', async ({ page }) => {
  await page.evaluate(() => { state.gems = 42; state.totalCents = 777; saveState(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    localStorage.clear();
    document.cookie = 'mennaMult=; max-age=0; path=/';
  });
  await page.reload();
  await expect(page.locator('#startBankAmount')).toHaveText('$7.77');
  expect(await page.evaluate(() => state.gems)).toBe(42);
});

test('treats are bought with gems, kept in the jar, and used up when Pom eats them', async ({ page }) => {
  await page.evaluate(() => { state.gems = 10; saveState(); renderGems(); });
  await expect(page.locator('#treatJar')).toBeHidden();
  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="treat"]').click();
  await expect(page.locator('#closetItems .item')).toHaveCount(8);

  // Tapping picks the treat; the Buy button spends the gems. The same treat can be bought again.
  await page.locator('.item[data-id="cake"]').click();
  await expect(page.locator('#buyBtn')).toHaveText('Need 5 more 💎');
  await expect(page.locator('#buyBtn')).toBeDisabled();
  await page.locator('.item[data-id="cookie"]').click();
  await page.locator('#buyBtn').click();
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .gem-badge')).toHaveText('💎 4');
  await expect(page.locator('.item[data-id="cookie"] .have')).toHaveText('2 in the jar');
  await page.locator('.item[data-id="donut"]').click();
  await expect(page.locator('#buyBtn')).toHaveText('Need 1 more 💎');
  expect(await page.evaluate(() => { buyTreat(); return state.gems; })).toBe(4);

  await page.locator('#closetBackBtn').click();
  await expect(page.locator('#treatJar .toy-btn')).toHaveCount(1);
  await expect(page.locator('#treatJar .count')).toHaveText('2');

  // Feeding uses one up, and the jar survives a reload
  await page.locator('#treatJar .toy-btn[data-id="cookie"]').click();
  await expect(page.locator('#pomStart')).toHaveClass(/eating/);
  await expect(page.locator('#startBubble')).toContainText('Cookie');
  await expect(page.locator('#treatJar .count')).toHaveText('1');
  await page.reload();
  expect(await page.evaluate(() => ({ treats: state.treats, gems: state.gems }))).toEqual({ treats: { cookie: 1 }, gems: 4 });
  await page.locator('#treatJar .toy-btn').click();
  await expect(page.locator('#treatJar')).toBeHidden();
  expect(await page.evaluate(() => state.treats)).toEqual({});
});

test('Pom buys toys, plays with them, and uses them in streak tricks', async ({ page }) => {
  await page.evaluate(() => { state.gems = 20; state.totalCents = 90; saveState(); });
  await page.reload();
  await expect(page.locator('#toyShelf')).toBeHidden();

  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="toy"]').click();
  await page.locator('.item[data-id="ball"]').click();
  await page.locator('.color-btn[data-id="ball"]').click(); // tries it out first
  await expect(page.locator('#pomCloset')).toHaveClass(/play-ball/);
  await expect(page.locator('#buyBtn')).toHaveText('Buy Bouncy Ball for 10 💎');
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .gem-badge')).toHaveText('💎 10');
  await expect(page.locator('.item[data-id="ball"] .price')).toHaveText('🎨 1 of 11');
  await expect(page.locator('.color-btn[data-id="ball"] .price')).toHaveText('Playing ✓');
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
