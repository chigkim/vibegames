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

// Answers the current question right (or wrong) and waits for the next one.
async function answer(page, right) {
  await expect(page.locator('#answerDisplay')).toHaveClass(/empty/);
  const q = await page.evaluate(() => ({ a: game.a, b: game.b, div: game.div, answer: answerOf(game) }));
  await page.evaluate(() => { game.input = ''; });
  await page.keyboard.type(String(q.answer + (right ? 0 : 1)));
  await page.keyboard.press('Enter');
  return q;
}

// Puts a times fact on screen in place of the one the round picked.
async function askFact(page, a, b) {
  await page.evaluate(([x, y]) => {
    Object.assign(game, { a: x, b: y, div: false });
    $('factorA').textContent = x; $('opSign').textContent = '×'; $('factorB').textContent = y;
  }, [a, b]);
}

test('easy facts pay less than hard ones', async ({ page }) => {
  const pay = await page.evaluate(() => [
    [1, 9], [9, 1], [2, 3], [13, 2], [10, 7], [3, 10], [3, 3], [4, 12], [5, 5],
    [6, 6], [7, 8], [6, 12], [12, 13], [11, 11], [1, 19], [2, 17], [10, 19], [4, 17], [7, 15], [13, 19],
    [16, 18], [19, 19], [0, 0], [0, 19], [13, 0],
  ].map(([a, b]) => centsFor(a, b)));
  expect(pay).toEqual([1, 1, 2, 2, 2, 2, 3, 5, 3, 6, 6, 7, 7, 7, 1, 2, 2, 8, 9, 9, 10, 10, 1, 1, 1]);
  // Every pay from 1¢ to 10¢ is used
  const all = await page.evaluate(() => [...new Set(FACT_KEYS.map(k => centsFor(...factsOf(k))))]);
  expect(all.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('right answer adds the shown pay, wrong answer costs nothing', async ({ page }) => {
  await page.locator('#pathBtn').click();

  const cents = await page.evaluate(() => centsFor(game.a, game.b));
  await expect(page.locator('#worth')).toHaveText(`This one pays ${cents}¢!`);
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$' + (cents / 100).toFixed(2));

  await page.waitForTimeout(2000); // next question
  await answer(page, false);
  await expect(page.locator('#gameBankAmount')).toHaveText('$' + (cents / 100).toFixed(2));
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
  await payBtn.click(); // only asks to confirm
  await expect(page.locator('#payAsk')).toHaveText('Did you pay $3.40?');
  await expect(page.locator('#cashBankAmount')).toHaveText('$3.40');
  await page.locator('#payYesBtn').click();

  await expect(page.locator('#cashBankAmount')).toHaveText('$0.00');
  await expect(page.locator('#statPaid')).toHaveText('$3.40');
  await expect(page.locator('#statAllTime')).toHaveText('$3.40');
  await expect(page.locator('.payout-row')).toHaveCount(1);
  await expect(page.locator('.payout-row')).toContainText('$3.40');
  await expect(payBtn).toBeVisible();
  await expect(payBtn).toBeDisabled();

  await page.reload();
  await page.locator('#cashoutBtn').click();
  await expect(page.locator('#statPaid')).toHaveText('$3.40');
  await expect(page.locator('.payout-row')).toHaveCount(1);
  await page.locator('#cashBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
  await expect(page.locator('#startBankAmount')).toHaveText('$0.00');
});

test('a quick double tap on Pay out does not pay; Not yet cancels', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 250; saveState(); });
  await page.reload();
  await page.locator('#cashoutBtn').click();
  await page.locator('#payBtn').click();
  // "Yes, paid" sits under where Pay out was, and stays off for a second.
  await expect(page.locator('#payYesBtn')).toBeDisabled();
  await page.locator('#payYesBtn').click({ force: true });
  await expect(page.locator('#cashBankAmount')).toHaveText('$2.50');
  await page.locator('#payNoBtn').click();
  await expect(page.locator('#payConfirm')).toBeHidden();
  await expect(page.locator('#payBtn')).toHaveText('Pay out $2.50');
  expect(await page.evaluate(() => state.paidCents)).toBe(0);

  await page.locator('#payBtn').click();
  await expect(page.locator('#payYesBtn')).toBeEnabled({ timeout: 2000 });
  await page.locator('#payYesBtn').click();
  await expect(page.locator('#cashBankAmount')).toHaveText('$0.00');
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

test('a first wrong answer offers the picture hint', async ({ page }) => {
  await page.locator('#pathBtn').click();
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
  await page.locator('#pathBtn').click();

  // Hint button after one miss
  await askFact(page, 7, 8);
  await answer(page, false);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#worth')).toHaveText('With the picture, this one pays 1¢');
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.51'); // 50 + 1

  // Count-together picture after two misses
  await page.waitForTimeout(2200);
  await askFact(page, 9, 9);
  await answer(page, false);
  await answer(page, false);
  await expect(page.locator('#gridArea')).toBeVisible();
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.52'); // 51 + 1
});

test('0 facts come up in rounds, pay 1¢, and the picture shows no dots', async ({ page }) => {
  const zeros = await page.evaluate(() => {
    startRound('main');
    let n = 0;
    for (let i = 0; i < 100; i++) { const q = pickQuestion(true); if (q.a === 0 || q.b === 0) n++; }
    goHome();
    return n;
  });
  expect(zeros).toBe(100);

  await page.locator('#pathBtn').click();
  await askFact(page, 0, 7);
  await answer(page, false);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#arrayGrid .zero-note')).toContainText('0');
  await answer(page, true);
  await expect(page.locator('#feedback')).toHaveText('0 × 7 = 0 ✓');
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.01');
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

test('every round asks at least one 0 fact', async ({ page }) => {
  const missing = await page.evaluate(() => {
    let rounds = 0;
    for (let r = 0; r < 60; r++) {
      startRound(r % 3 ? 'main' : 'extra');
      let zero = false;
      for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
        if (game.a === 0 || game.b === 0) zero = true;
        // Every other round, each missed fact comes back next question, so retries crowd out the 0 fact.
        else if (r % 2) game.retries.push({ a: game.a, b: game.b, div: game.div, key: keyOf(game), at: i + 1 });
        if (i < QUESTIONS_PER_ROUND - 1) { game.index++; nextQuestion(); }
      }
      if (!zero) rounds++;
    }
    goHome();
    return rounds;
  });
  expect(missing).toBe(0);
});

// Like an iPad tab that Safari froze: another tab saves, and this tab never hears about it.
// A save written from this same page fires no storage event, so the page really stays out of date.
async function saveFromOtherTab(page, change) {
  await page.evaluate(change => {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    Object.assign(saved, new Function('return ' + change)()(), { savedAt: saved.savedAt + 1000 });
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  }, String(change));
}

const snapshot = page => page.evaluate(() => ({ cents: state.totalCents, paid: state.paidCents, gems: state.gems, payouts: state.payouts.length }));

test('a tab that missed another tab\'s payout cannot pay it again, and adds to it instead of undoing it', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 500; state.gems = 4; saveState(); });
  await page.evaluate(() => { onPayTap(); }); // the stale tab is asking "Did you pay $5.00?"
  await saveFromOtherTab(page, () => ({ totalCents: 0, paidCents: 500, gems: 2, payouts: [{ t: Date.now(), c: 500 }] }));
  expect(await snapshot(page)).toEqual({ cents: 500, paid: 0, gems: 4, payouts: 0 }); // still stale

  await page.evaluate(() => onPayYes());
  expect(await snapshot(page)).toEqual({ cents: 0, paid: 500, gems: 2, payouts: 1 }); // took the other save, paid nothing
  await page.evaluate(() => { changeBank(7); state.gems += 1; saveState(); });
  expect(await snapshot(page)).toEqual({ cents: 7, paid: 500, gems: 3, payouts: 1 });
});

test('a stale tab cannot spend gems the other tab already spent', async ({ page }) => {
  await page.evaluate(() => { state.gems = 10; saveState(); });
  await page.locator('#houseBtn').click();
  await page.evaluate(() => { for (let i = 0; i < 10; i++) state.mastery[i] = STICKER_AT; showHouse(); });
  await page.locator('#furnItems .item[data-id="bed"]').click();
  await page.locator('#furnColors .color-btn[data-id="bed"]').click();
  // The other tab spent 8 of the 10 gems on a lamp.
  await saveFromOtherTab(page, () => ({ gems: 2, furniture: encodeOwned(FURNITURE, ['lamp']) }));
  await page.locator('#furnBuyBtn').click();
  expect(await page.evaluate(() => ({ gems: state.gems, furniture: state.furniture }))).toEqual({ gems: 2, furniture: ['lamp'] });
  await expect(page.locator('.house-head .gem-badge')).toHaveText('💎 2');
});

test('a stale tab keeps the other tab\'s treats, items, furniture and sticker dots', async ({ page }) => {
  await page.evaluate(() => { state.gems = 20; state.treats = { cookie: 1 }; state.mastery[FACT_INDEX['3x4']] = 1; saveState(); });
  await saveFromOtherTab(page, () => {
    const mastery = state.mastery.slice();
    mastery[FACT_INDEX['3x4']] = 2;
    mastery[FACT_INDEX['5x6']] = 2;
    return { treats: { cookie: 1, apple: 2 }, owned: encodeOwned(CLOSET, [CLOSET.find(i => i.price > 0).id]), furniture: encodeOwned(FURNITURE, ['rug']), mastery: mastery.join('') };
  });
  // This tab answers 7x8 and buys a cookie without hearing about the other save.
  await page.evaluate(() => { state.mastery[FACT_INDEX['7x8']] = 1; treatPick = 'cookie'; buyTreat(); });
  const merged = await page.evaluate(() => ({
    treats: state.treats, owned: state.owned.length, furniture: state.furniture,
    m34: state.mastery[FACT_INDEX['3x4']], m56: state.mastery[FACT_INDEX['5x6']], m78: state.mastery[FACT_INDEX['7x8']],
  }));
  expect(merged).toEqual({ treats: { cookie: 2, apple: 2 }, owned: 1, furniture: ['rug'], m34: 2, m56: 2, m78: 1 });
});

test('Ms. Menna does a trick for 3 right in a row', async ({ page }) => {
  await page.locator('#pathBtn').click();
  for (let i = 0; i < 2; i++) {
    await answer(page, true);
    await expect(page.locator('#pomGame')).not.toHaveClass(/trick-/);
    await page.waitForTimeout(1400);
  }
  await answer(page, true);
  await expect(page.locator('#pomGame')).toHaveClass(/trick-spin/);
  await expect(page.locator('#gameBubble')).toContainText('3 in a row');
});

test('the sticker chart has a times page and a divide page', async ({ page }) => {
  await page.evaluate(() => {
    for (const k of ['3x7', '4x17', '0x0', 'd7x8', 'd2x2']) state.mastery[FACT_INDEX[k]] = 3;
    state.mastery[FACT_INDEX['2x5']] = 1;
    saveState();
  });
  await page.locator('#stickersBtn').click();
  await expect(page.locator('#stickerCount')).toHaveText('3 of 231 stickers');
  // 0 to 20 plus headings is a 22×22 grid; 3×7 and 7×3 both show the sticker
  await expect(page.locator('#stickerGrid > div')).toHaveCount(22 * 22);
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(5);
  await expect(page.locator('#stickerGrid > div').nth(1)).toHaveText('0');
  await expect(page.locator('#stickerGrid .dots')).toHaveCount(2);

  // No 0 row or column on the divide page. 56 ÷ 7 and 56 ÷ 8 share a sticker.
  await page.locator('#tabDivide').click();
  await expect(page.locator('#stickerCount')).toHaveText('2 of 210 stickers');
  await expect(page.locator('#stickerGrid > div')).toHaveCount(21 * 21);
  await expect(page.locator('#stickerGrid > div').nth(1)).toHaveText('1');
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(3); // 56 ÷ 7, 56 ÷ 8, 4 ÷ 2
  await expect(page.locator('#stickerGrid > .got[title="56 ÷ 7 = 8"]')).toHaveCount(1);
  await expect(page.locator('#stickerShare')).toHaveText('56 ÷ 7 and 56 ÷ 8 share a sticker!');
  await page.locator('#stickerBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
});

test('a right answer earns the third dot and a sticker; a wrong one costs a dot', async ({ page }) => {
  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.locator('#pathBtn').click();
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

const askOneTimesOne = page => askFact(page, 1, 1);

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
    cents: state.totalCents, paid: state.paidCents, gems: state.gems, owned: state.owned, worn: state.worn,
    m78: state.mastery[FACT_INDEX['7x8']], m1313: state.mastery[FACT_INDEX['13x13']], m69: state.mastery[FACT_INDEX['6x9']],
    learned: state.mastery.filter(m => m === 3).length, w78: state.weights['7x8'], w1213: state.weights['12x13'],
  }));
  expect(loaded).toEqual({
    cents: 437, paid: 120, gems: 9, owned: ['party', 'choc'], worn: { hat: 'party', fur: 'choc' },
    m78: 3, m1313: 3, m69: 2, learned: 2, w78: 5.5, w1213: 3,
  });

  // Loading saved it again in the v22 format. It still starts with the v11 sticker string, so an old tab still open reads it right
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(STORE_KEY)));
  expect(saved.v).toBe(22);
  expect(saved.mastery.slice(0, 91)).toBe(old);
  expect(saved.mastery).toHaveLength(441);
  await page.reload();
  expect(await page.evaluate(() => [state.weights['7x8'], state.weights['12x13'], state.weights['1x1']])).toEqual([5.5, 3, undefined]);
});

test('a missed fact comes back later in the same round', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const missed = await answer(page, false);
  await page.waitForTimeout(800);
  await answer(page, true); // second try, on question 1
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(2000);
    seen.push(await answer(page, true));
  }
  const key = q => (q.div ? 'd' : '') + Math.min(q.a, q.b) + 'x' + Math.max(q.a, q.b);
  expect(seen.slice(2).some(q => key(q) === key(missed))).toBe(true);
});

test('first-try answers earn Ms. Menna gems without changing the money', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const { a, b } = await answer(page, true);
  const cents = await page.evaluate(([x, y]) => centsFor(x, y), [a, b]);
  await expect(page.locator('#pomGame .gem-badge')).toHaveText('💎 1');
  await expect(page.locator('#gameBankAmount')).toHaveText('$' + (cents / 100).toFixed(2));

  await page.waitForTimeout(2000);
  await answer(page, false); // wrong answers cost cents, never gems
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => state.gems)).toBe(1);
});

test("Ms. Menna's Closet buys, wears, and saves outfits with gems only", async ({ page }) => {
  await page.evaluate(() => { state.gems = 12; state.totalCents = 250; saveState(); });
  await page.reload();
  await expect(page.locator('#pomStart .gem-badge')).toHaveText('💎 12');
  await expect(page.locator('#houseBtn')).toHaveClass(/glow/);
  await page.locator('#houseBtn').click();
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

  await page.locator('#houseBtn').click();
  await page.locator('#closetBtn').click();
  await page.locator('.item[data-id="party"]').click();
  await page.locator('.color-btn[data-id="party"]').click();
  await page.locator('#closetBackBtn').click();
  await page.locator('#houseBackBtn').click();
  await expect(page.locator('#pomStart .acc-hat polygon')).toHaveCount(1);
});

test('saved progress still fits in the cookie mirror', async ({ page }) => {
  const cookie = await page.evaluate(() => {
    FACT_KEYS.forEach(k => { state.weights[k] = 11.55; });
    state.mastery = state.mastery.map(() => 3);
    state.days = state.days.map(() => today());
    state.levels = state.levels.map(() => SLEEPY_NOW);
    state.payouts = Array.from({ length: MAX_PAYOUTS_KEPT }, () => ({ t: Date.now(), c: 12345 }));
    state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
    state.worn = { hat: 'crown.s', face: 'hearts', neck: 'medal', back: 'cape', fur: 'pink' };
    state.gems = 99999;
    state.furniture = FURNITURE.flatMap(f => Object.values(FURN).filter(p => p.base === f.id && p.price > 0).map(p => p.id));
    saveState();
    // A full save can be too big for a cookie. Then the cookie drops only the payout list, which IndexedDB still has.
    const raw = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
    const local = JSON.parse(localStorage.getItem(STORE_KEY));
    const saved = raw && readCookie();
    return { size: raw ? raw[0].length : 0, same: !!saved && saved.review === local.review && saved.mastery === local.mastery && saved.gems === local.gems };
  });
  expect(cookie.size).toBeGreaterThan(0);
  expect(cookie.size).toBeLessThan(4096);
  expect(cookie.same).toBe(true);
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
  await page.locator('#houseBtn').click();
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

test('a cookie copy without payouts does not erase the payout list in IndexedDB', async ({ page }) => {
  await page.evaluate(() => {
    state.furniture = FURNITURE.flatMap(f => Object.values(FURN).filter(p => p.base === f.id && p.price > 0).map(p => p.id));
    state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
    // More payouts than are kept, so the save is too big for the cookie and the cookie copy drops them
    // Random numbers, because the cookie is compressed and repeated ones would still fit
    state.payouts = Array.from({ length: 300 }, (_, i) => ({ t: Date.now() - i * 7919 - Math.floor(Math.random() * 1e6), c: i ? 10000 + Math.floor(Math.random() * 90000) : 12345 }));
    FACT_KEYS.forEach(k => { state.weights[k] = 1.02 + Math.floor(Math.random() * 1000) / 100; });
    state.mastery = state.mastery.map(() => 3);
    state.totalCents = 321;
    saveState();
  });
  await page.waitForTimeout(300);
  const cookie = await page.evaluate(() => readCookie());
  expect(cookie).toMatchObject({ partial: true, payouts: [] });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect.poll(() => page.evaluate(() => state.payouts.length)).toBe(30);
  expect(await page.evaluate(() => state.payouts[0].c)).toBe(12345);
  expect(await page.evaluate(() => state.totalCents)).toBe(321);
});

test('the house Ms. Menna stays inside the house before it is opened', async ({ page }) => {
  // Even with the Bedroom locked on a new save, she must never land on the body.
  expect(await page.evaluate(() => houseWalker.el.parentElement.id)).toBe('houseRoom');
  await expect(page.locator('#pomHouse')).toBeHidden();
  await page.evaluate(() => { for (let i = 0; i < 10; i++) state.mastery[i] = STICKER_AT; saveState(); });
  await page.reload();
  expect(await page.evaluate(() => houseWalker.el.parentElement.id)).toBe('houseRoom');
  await expect(page.locator('#pomHouse')).toBeHidden();
});

test('treats are bought with gems, kept in the jar, and used up when Ms. Menna eats them', async ({ page }) => {
  await page.evaluate(() => { state.gems = 10; saveState(); renderGems(); });
  await expect(page.locator('#treatJar')).toBeHidden();
  await page.locator('#houseBtn').click();
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
  await page.locator('#houseBackBtn').click();
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

test('Ms. Menna buys toys, plays with them, and uses them in streak tricks', async ({ page }) => {
  await page.evaluate(() => { state.gems = 20; state.totalCents = 90; saveState(); });
  await page.reload();
  await expect(page.locator('#toyShelf')).toBeHidden();

  await page.locator('#houseBtn').click();
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
  await page.locator('#houseBackBtn').click();

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

test('the Bedroom needs 10 stickers, but the Closet works before that', async ({ page }) => {
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseRoom')).toHaveClass(/locked/);
  await expect(page.locator('#houseBubble')).toHaveText('10 more ⭐ to open my Bedroom!');
  await expect(page.locator('#furnItems')).toBeHidden();
  await page.locator('#closetBtn').click();
  await expect(page.locator('#closetScreen')).toHaveClass(/active/);
  expect(await page.evaluate(() => ROOMS.map(r => r.need))).toEqual([10, 30, 60, 100, 150]);
});

test('a v15 save keeps rooms with furniture open under the new sticker counts', async ({ page }) => {
  // v15 opened the Bedroom at 0 stickers and the Garden at 140.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    const mastery = Array(FACT_KEYS.length).fill(0);
    for (let i = 0; i < 145; i++) mastery[i] = STICKER_AT;
    const garden = FURNITURE.find(f => f.room === 'garden' && f.price > 0).id;
    Object.assign(saved, { mastery: mastery.join(''), furniture: encodeOwned(FURNITURE, ['bed', garden]), home: 'bed,' + garden, room: 'garden', savedAt: Date.now() });
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  });
  await page.reload();
  await page.locator('#houseBtn').click();
  await expect(page.locator('.room-tab[data-room="garden"]')).not.toHaveClass(/locked/);
  await expect(page.locator('.room-tab[data-room="yard"]')).not.toHaveClass(/locked/); // 145 stickers
  expect(await page.evaluate(() => state.room)).toBe('garden');

  // A new player with 5 stickers and a bed from v15 keeps the Bedroom; with no furniture it stays locked.
  await page.evaluate(() => { state.mastery.fill(0); for (let i = 0; i < 5; i++) state.mastery[i] = STICKER_AT; showHouse(); });
  expect(await page.evaluate(() => [roomOpen(ROOM.bedroom), roomOpen(ROOM.garden), roomOpen(ROOM.yard)])).toEqual([true, true, false]);
  await page.evaluate(() => { state.furniture = []; });
  expect(await page.evaluate(() => roomOpen(ROOM.bedroom))).toBe(false);
});

test("Ms. Menna's House opens rooms with stickers and buys furniture colors with gems", async ({ page }) => {
  await page.evaluate(() => { state.gems = 30; state.totalCents = 120; for (let i = 0; i < 30; i++) state.mastery[i] = STICKER_AT; saveState(); });
  await page.reload();
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseScreen')).toHaveClass(/active/);

  // 30 stickers open the Kitchen but not the Playroom
  await expect(page.locator('.room-tab[data-room="kitchen"]')).not.toHaveClass(/locked/);
  await expect(page.locator('.room-tab[data-room="playroom"]')).toHaveClass(/locked/);
  await page.locator('.room-tab[data-room="playroom"]').click();
  await expect(page.locator('#houseBubble')).toHaveText('30 more ⭐ to open it!');

  // The closet is free; an empty spot shows its colors, and a color is shown in place before buying
  await expect(page.locator('#houseRoom .spot[data-id="wardrobe"]')).not.toHaveClass(/empty/);
  await expect(page.locator('#houseRoom .spot[data-id="bed"]')).toHaveClass(/empty/);
  await page.locator('#furnItems .item[data-id="bed"]').click();
  await expect(page.locator('#furnColors .color-btn')).toHaveCount(11);
  await page.locator('#furnColors .color-btn[data-id="bed"]').click();
  await expect(page.locator('#houseRoom .spot[data-id="bed"]')).toHaveClass(/trying/);
  await page.locator('#furnBuyBtn').click();
  await expect(page.locator('.house-head .gem-badge')).toHaveText('💎 20');

  // A second color, then swap back to the first for free; a color is never bought twice
  const second = await page.evaluate(() => FURN.bed.colors[1].id);
  await page.locator(`#furnColors .color-btn[data-id="${second}"]`).click();
  await page.locator('#furnBuyBtn').click();
  const afterTwo = await page.evaluate(() => state.gems);
  await page.locator('#furnColors .color-btn[data-id="bed"]').click();
  await expect(page.locator('#furnColors .color-btn[data-id="bed"] .price')).toHaveText('In my house ✓');
  expect(await page.evaluate(() => { houseTrying = 'bed'; buyFurniture(); return state.gems; })).toBe(afterTwo);

  // Saved, and the piggy bank is untouched
  await page.reload();
  const saved = await page.evaluate(() => ({ furn: state.furniture, home: state.home, gems: state.gems, cents: state.totalCents }));
  expect(saved).toEqual({ furn: ['bed', second], home: { bed: 'bed' }, gems: afterTwo, cents: 120 });

  // The closet opens from the house and goes back to it
  await page.locator('#houseBtn').click();
  await page.locator('#closetBtn').click();
  await expect(page.locator('#closetScreen')).toHaveClass(/active/);
  await page.locator('#closetBackBtn').click();
  await expect(page.locator('#houseScreen')).toHaveClass(/active/);
});

// v22: Learn with Ms. Menna (0 to 10) and Learn Extra (11 to 20), with division once a table is learned.
const giveStickers = (page, keys) => page.evaluate(list => {
  for (const k of list) state.mastery[FACT_INDEX[k]] = STICKER_AT;
  saveState();
  renderPath();
}, keys);
// The facts of the ×n table from n × from to n × to, as sticker keys.
const tableKeys = (n, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map(k => (k <= n ? `${k}x${n}` : `${n}x${k}`));

// Plays rounds without answering and lists every question asked.
const playRounds = (page, path, rounds) => page.evaluate(([path, rounds]) => {
  const out = [];
  for (let r = 0; r < rounds; r++) {
    startRound(path);
    const round = [];
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      round.push({ a: game.a, b: game.b, div: game.div, key: keyOf(game), sticker: hasSticker(keyOf(game)) });
      if (i < QUESTIONS_PER_ROUND - 1) { game.index++; nextQuestion(); }
    }
    out.push(round);
  }
  goHome();
  return out;
}, [path, rounds]);

test('both paths are on the home screen and the number buttons are gone', async ({ page }) => {
  await expect(page.locator('#picker')).toHaveCount(0);
  await expect(page.locator('#pathNow')).toHaveText('Learning ×2 · 0 of 11 stickers');
  await expect(page.locator('#extraNow')).toHaveText('Learning ×11 · 0 of 12 stickers');
  await page.locator('#pathBtn').click();
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
  await expect(page.locator('#opSign')).toHaveText('×');

  // ×2 first, with no division before a table is learned
  const main = (await playRounds(page, 'main', 20)).flat();
  expect(main.filter(q => q.a !== 2 && q.b !== 2)).toEqual([]);
  expect(main.filter(q => q.div)).toEqual([]);

  // Learn Extra starts at ×11, open from the start, and its ×11 goes up to 11 × 11
  const extra = (await playRounds(page, 'extra', 20)).flat();
  expect(extra.filter(q => q.a !== 11 && q.b !== 11)).toEqual([]);
  expect(Math.max(...extra.map(q => Math.min(q.a, q.b)))).toBe(11);
});

test('a path moves on at 80%, rounds are mostly known facts, and learned tables bring division', async ({ page }) => {
  await giveStickers(page, tableKeys(2, 2, 10)); // 9 of the 11 ×2 facts
  await expect(page.locator('#pathNow')).toHaveText('Learning ×10 · 1 of 11 stickers'); // 2 × 10 counts for ×10 too
  const rounds = await playRounds(page, 'main', 40);
  for (const round of rounds) {
    for (const q of round) {
      expect([2, 10].includes(q.a) || [2, 10].includes(q.b)).toBe(true);
      if (q.div) expect(q.a * q.b % q.a).toBe(0);
    }
  }
  const learning = rounds.map(round => round.filter(q => !q.div && !q.sticker).length);
  expect(Math.max(...learning)).toBeLessThanOrEqual(4); // 3 new facts, and maybe a 0 fact she is learning
  expect(Math.min(...learning)).toBeGreaterThanOrEqual(3);
  const divides = rounds.map(round => round.filter(q => q.div).length);
  expect(Math.min(...divides)).toBeGreaterThanOrEqual(2); // about 3 in 10; a 0 fact can take one slot
  expect(Math.max(...divides)).toBeLessThanOrEqual(3);

  await giveStickers(page, tableKeys(11, 0, 9)); // 10 of the 12 ×11 facts
  await expect(page.locator('#extraNow')).toHaveText('Learning ×12 · 0 of 13 stickers');
});

test('finishing a table on the path says what comes next', async ({ page }) => {
  await giveStickers(page, tableKeys(2, 2, 9));
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    state.mastery[FACT_INDEX[factKey(2, 10)]] = STICKER_AT;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  });
  await expect(page.locator('#summaryScreen')).toHaveClass(/active/);
  await expect(page.locator('#pathUp')).toHaveText('🐾 You learned ×2! Next up: ×10');
  await expect(page.locator('#homeBtn')).toHaveText('← Home');
  await page.locator('#againBtn').click();
  expect(await page.evaluate(() => [game.path, game.step])).toEqual(['main', 1]);
});

test('division pays like its times fact, hints with the missing number, and shows the fact family', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const askDivide = (a, b) => page.evaluate(([x, y]) => {
    Object.assign(game, { a: x, b: y, div: true });
    $('factorA').textContent = x * y; $('opSign').textContent = '÷'; $('factorB').textContent = x;
  }, [a, b]);

  // 56 ÷ 8 = 7 pays what 8 × 7 pays, and earns a dot on the sticker 56 ÷ 7 shares
  await askDivide(8, 7);
  await expect(page.locator('#equation')).toHaveText(/56\s*÷\s*8/);
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.06');
  await expect(page.locator('#feedback')).toContainText('56 ÷ 8 = 7 ✓');
  await expect(page.locator('#feedback .family')).toHaveText('8 × 7 = 56 · 7 × 8 = 56 · 56 ÷ 7 = 8');
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['d7x8']])).toBe(1);

  // The picture turns 56 ÷ 7 into 7 × ? = 56, and pays 1¢ after it
  await page.waitForTimeout(2200);
  await askDivide(7, 8);
  await answer(page, false);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['d7x8']])).toBe(0);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#gameBubble')).toHaveText('7 × ? = 56. How many in each row?');
  await expect(page.locator('#gridCaption')).toHaveText('56 dots in 7 rows. How many in each row?');
  await expect(page.locator('#arrayGrid .cell')).toHaveCount(56);
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('$0.07');
  await expect(page.locator('#feedback .family')).toHaveText('7 × 8 = 56 · 8 × 7 = 56 · 56 ÷ 8 = 7');

  // Division is never by 0, and a square has a one-line family
  expect(await page.evaluate(() => [FACT_INDEX['d0x5'], DIVIDE_KEYS.length])).toEqual([undefined, 210]);
  await page.waitForTimeout(2200);
  await askDivide(6, 6);
  await answer(page, true);
  await expect(page.locator('#feedback .family')).toHaveText('6 × 6 = 36');
});

test('division stickers count towards opening rooms', async ({ page }) => {
  await giveStickers(page, await page.evaluate(() => DIVIDE_KEYS.slice(0, 10)));
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseRoom')).not.toHaveClass(/locked/);
});

test("Ms. Menna's longer names fit on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const wide = el => page.locator(el).evaluate(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 1);
  await expect(page.locator('#houseBtn .label')).toHaveText("🏠 Ms. Menna's House");
  for (const el of ['#houseBtn', '#pathBtn']) expect(await wide(el)).toBe(false);
  await page.evaluate(() => { state.mastery[FACT_INDEX[factKey(2, 3)]] = STICKER_AT; saveState(); });
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseScreen h1')).toHaveText("Ms. Menna's House 🏠");
  expect(await wide('#houseScreen .house-head')).toBe(false);
  await page.locator('#closetBtn').click();
  await expect(page.locator('#closetScreen h1')).toHaveText("Ms. Menna's Closet 🎀");
  expect(await wide('#closetScreen h1')).toBe(false);
});

test('strategy hints build hard facts from easier ones', async ({ page }) => {
  test.setTimeout(45000); // each split picture takes about 8 seconds to walk through
  const plans = await page.evaluate(() => [[7, 6], [8, 9], [3, 4], [8, 8], [13, 7], [2, 7], [5, 6], [10, 4], [1, 6]]
    .map(([a, b]) => { const { rows, cols, p, q } = hintPlan({ a, b }); return [rows, cols, p ?? null, q ?? null]; }));
  expect(plans).toEqual([
    [6, 7, 5, 1], [9, 8, 10, -1], [3, 4, 2, 1], [8, 8, 4, 4], [13, 7, 10, 3],
    [2, 7, null, null], [6, 5, null, null], [4, 10, null, null], [1, 6, null, null],
  ]);

  await page.locator('#pathBtn').click();
  await askFact(page, 7, 6);
  await answer(page, false);
  await answer(page, false);
  await expect(page.locator('#gameBubble')).toHaveText('6 is 5 and 1 more. Find 5 × 7, then add one more 7!');
  await expect(page.locator('#gridCaption')).toContainText('5 rows + 1 row');
  await expect(page.locator('#arrayGrid .cell')).toHaveCount(42);
  await expect(page.locator('#arrayGrid .split-line')).toHaveCount(1);
  await expect(page.locator('#gameBubble')).toHaveText('5 × 7 = 35!', { timeout: 5000 });
  await expect(page.locator('#gameBubble')).toHaveText('1 × 7 = 7!', { timeout: 5000 });
  await expect(page.locator('#gameBubble')).toHaveText('35 + 7 = 42!', { timeout: 5000 });

  // 9 is drawn as 10 rows with the last one taken away
  await answer(page, true);
  await page.waitForTimeout(2200);
  await askFact(page, 9, 4);
  await answer(page, false);
  await answer(page, false);
  await expect(page.locator('#arrayGrid .cell')).toHaveCount(40);
  await expect(page.locator('#arrayGrid .cell.away')).toHaveCount(4, { timeout: 8000 });
  await expect(page.locator('#gameBubble')).toHaveText('40 − 4 = 36!', { timeout: 5000 });
});

// v19: stickers are learned on 2 days, then come back sleepy for review visits.
const setFact = (page, key, mastery, daysAgo, level = 0) => page.evaluate(([k, m, ago, lv]) => {
  const i = FACT_INDEX[k];
  state.mastery[i] = m;
  state.days[i] = today() - ago;
  state.levels[i] = lv;
  saveState();
}, [key, mastery, daysAgo, level]);


test('the last sticker dot has to come on another day', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await setFact(page, '6x7', 2, 0); // second dot was today
  await askFact(page, 6, 7);
  await answer(page, true);
  await expect(page.locator('#gameBubble')).toContainText('tomorrow');
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['6x7']])).toBe(2);

  await page.waitForTimeout(1900);
  await setFact(page, '6x7', 2, 1); // second dot was yesterday
  await askFact(page, 6, 7);
  await answer(page, true);
  await expect(page.locator('.banner')).toContainText('New sticker: 6 × 7');
  expect(await page.evaluate(() => [state.mastery[FACT_INDEX['6x7']], state.levels[FACT_INDEX['6x7']], state.days[FACT_INDEX['6x7']] === today()]))
    .toEqual([3, 0, true]);
});

test('a sticker gets sleepy when its visit is due, and a right answer wakes it', async ({ page }) => {
  await setFact(page, '3x4', 3, 0);   // earned today: not sleepy
  await setFact(page, '3x5', 3, 1);   // first visit after 1 day: sleepy
  await setFact(page, '3x6', 3, 5, 2); // level 2 waits 7 days: not yet
  expect(await page.evaluate(() => ['3x4', '3x5', '3x6'].map(k => isSleepy(FACT_INDEX[k])))).toEqual([false, true, false]);
  await page.reload();
  await expect(page.locator('#pathNow')).toContainText('1 sleepy 💤');
  await page.locator('#stickersBtn').click();
  await expect(page.locator('#stickerGrid > .sleepy')).toHaveCount(2); // 3 × 5 and 5 × 3
  await expect(page.locator('#stickerCount')).toHaveText('3 of 231 stickers · 1 sleepy 💤');
  await page.locator('#stickerBackBtn').click();

  await page.locator('#pathBtn').click();
  await askFact(page, 5, 3);
  await answer(page, true);
  await expect(page.locator('.banner')).toContainText('5 × 3 woke up!');
  expect(await page.evaluate(() => [isSleepy(FACT_INDEX['3x5']), state.levels[FACT_INDEX['3x5']], state.mastery[FACT_INDEX['3x5']]]))
    .toEqual([false, 1, 3]);

  // A miss keeps the sticker but makes it sleepy, and a right answer later in the same round doesn't wake it
  await page.waitForTimeout(1900);
  await askFact(page, 3, 4);
  await answer(page, false);
  expect(await page.evaluate(() => [isSleepy(FACT_INDEX['3x4']), state.mastery[FACT_INDEX['3x4']]])).toEqual([true, 3]);
  await page.waitForTimeout(800);
  await answer(page, true);
  await page.waitForTimeout(1900);
  await askFact(page, 3, 4);
  await answer(page, true);
  expect(await page.evaluate(() => isSleepy(FACT_INDEX['3x4']))).toBe(true);
});

test('sleepy and hard facts come up more often', async ({ page }) => {
  const counts = await page.evaluate(() => {
    const set = (k, ago, level) => { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today() - ago; state.levels[i] = level; };
    set('2x3', 30, 4);
    set('2x4', 0, 0);
    game = { path: 'main', step: 9, index: 0, newAt: [], asked: new Set(), prevKey: null };
    const n = { '2x3': 0, '2x4': 0, '7x8': 0, '3x5': 0 };
    for (let i = 0; i < 6000; i++) { const q = pickQuestion(); const k = factKey(q.a, q.b); if (k in n) n[k]++; }
    return n;
  });
  expect(counts['2x3']).toBeGreaterThan(counts['2x4'] * 2); // sleepy vs. awake
  expect(counts['7x8']).toBeGreaterThan(counts['3x5'] * 1.2); // hard vs. easy
});

test('once the 0 stickers are earned, rounds no longer need a 0 fact', async ({ page }) => {
  const zeros = await page.evaluate(() => {
    // Every fact in the first 4 tables (×2, ×10, ×5, ×0 and ×1) has a sticker
    for (const k of PATH_FACTS.main.slice(0, 4).flat()) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    let total = 0;
    for (let r = 0; r < 30; r++) {
      startRound('main');
      let zero = false;
      for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
        if (game.a === 0 || game.b === 0) zero = true;
        if (i < QUESTIONS_PER_ROUND - 1) { game.index++; nextQuestion(); }
      }
      if (zero) total++;
    }
    const needed = game.zeroNeeded;
    goHome();
    return { total, needed };
  });
  expect(zeros.needed).toBe(false);
  expect(zeros.total).toBeLessThan(26); // now and then, not every round
});

test('after a hard round the path teaches 2 new facts instead of 3', async ({ page }) => {
  await page.locator('#pathBtn').click();
  expect(await page.evaluate(() => game.newAt.length)).toBe(3);
  await page.evaluate(() => { game.firstTry = 4; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  expect(await page.evaluate(() => state.easyPath)).toBe(true);
  await page.locator('#againBtn').click();
  expect(await page.evaluate(() => game.newAt.length)).toBe(2);
  await page.evaluate(() => { game.firstTry = 7; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  expect(await page.evaluate(() => state.easyPath)).toBe(true); // 7 is not strong enough to go back
  await page.locator('#againBtn').click();
  await page.evaluate(() => { game.firstTry = 9; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  expect(await page.evaluate(() => state.easyPath)).toBe(false);
  await page.locator('#againBtn').click();
  await page.evaluate(() => { game.firstTry = 6; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  expect(await page.evaluate(() => state.easyPath)).toBe(true); // 6 of 10 is now a hard round
  await page.locator('#againBtn').click();
  await page.evaluate(() => { game.firstTry = 9; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  await page.reload();
  expect(await page.evaluate(() => state.easyPath)).toBe(false);
});

test('×4 and ×9 facts count as hard, but not with 0, 1 or 2', async ({ page }) => {
  const hard = await page.evaluate(() => [[4, 3], [9, 5], [3, 9], [7, 3], [4, 2], [9, 1], [0, 9], [3, 5], [5, 10]].map(([a, b]) => isHard(a, b)));
  expect(hard).toEqual([true, true, true, true, false, false, false, false, true]);
});

test('Learn with Ms. Menna ends at ×10, and Learn Extra visits sleepy bigger stickers', async ({ page }) => {
  await page.evaluate(() => {
    const set = (k, ago, level) => { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today() - ago; state.levels[i] = level; };
    for (let a = 0; a <= 10; a++) for (let b = a; b <= 10; b++) set(factKey(a, b), 0, 0);
    set('6x15', 30, 4); // sleepy, earned with the number buttons before v22
    set('3x17', 0, 0);
    saveState();
    renderPath();
  });
  await expect(page.locator('#pathNow')).toHaveText('All tables done! Mixed review 🏆');
  await expect(page.locator('#extraNow')).toHaveText('Learning ×11 · 0 of 12 stickers · 1 sleepy 💤');
  const main = (await playRounds(page, 'main', 20)).flat();
  expect(main.filter(q => q.a > 10 || q.b > 10)).toEqual([]);
  expect(main.filter(q => q.div).length).toBeGreaterThan(40); // mixed review keeps dividing
  const extra = (await playRounds(page, 'extra', 20)).flat();
  expect(extra.filter(q => q.key === '6x15').length).toBeGreaterThan(0);
  expect(extra.filter(q => q.key === '3x17')).toEqual([]); // awake, and ×17 is not reached yet
});

test('an older plain cookie still loads, and is saved again compressed', async ({ page }) => {
  await page.evaluate(() => {
    const old = { totalCents: 615, gems: 8, mastery: '3'.repeat(210), savedAt: Date.now() };
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(old))}; path=/`;
  });
  await page.reload();
  await expect(page.locator('#startBankAmount')).toHaveText('$6.15');
  const saved = await page.evaluate(() => ({
    gems: state.gems,
    lz: document.cookie.includes(COOKIE_NAME + '=' + COOKIE_LZ),
    cookie: readCookie().v,
    local: JSON.parse(localStorage.getItem(STORE_KEY)).v,
    times: TIMES_KEYS.filter(hasSticker).length,
    divide: DIVIDE_KEYS.filter(hasSticker).length,
  }));
  expect(saved).toEqual({ gems: 8, lz: true, cookie: 22, local: 22, times: 210, divide: 0 });
});

test('older stickers get spread-out first visits, and review dates survive a reload', async ({ page }) => {
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    save.mastery = '3'.repeat(210); save.savedAt = Date.now(); delete save.review;
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
  });
  await page.reload();
  // Only the 210 old times facts had stickers
  const r = await page.evaluate(() => ({ sleepy: sleepyCount(), levels: new Set(state.levels.slice(0, 210)).size, spread: new Set(state.days.slice(0, 210)).size }));
  expect(r).toEqual({ sleepy: 0, levels: 1, spread: 7 });
  await page.evaluate(() => { state.days[5] = today() - 40; state.levels[5] = 3; state.levels[6] = SLEEPY_NOW; saveState(); });
  await page.reload();
  expect(await page.evaluate(() => [state.days[5] === today() - 40, state.levels[5], isSleepy(6), sleepyCount()])).toEqual([true, 3, true, 2]);
});
