// @ts-check
// Pay table and trade-in for Math with Ms. Menna. A grown-up may trade the
// coins for something real, so earnings and trade-ins must be exact.
const { test, expect } = require('@playwright/test');

const coins = n => n.toLocaleString('en-US') + (n === 1 ? ' coin' : ' coins');

test.beforeEach(async ({ page, context }) => {
  // Speech off in every tab: with no speechSynthesis, Speech.supported is false and Ms. Menna stays silent.
  await context.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }));
  // The keep-your-things notice waits for a far-off day, so it doesn't cover the screen when a test loads a save.
  await context.addInitScript(() => localStorage.setItem('mennaMultiplication_keepNotice', '99999'));
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
    [16, 18], [19, 19], [0, 0], [0, 19], [13, 0], [3, 6], [4, 9], [9, 9], [5, 9], [5, 12], [3, 16],
  ].map(([a, b]) => centsFor(a, b)));
  expect(pay).toEqual([1, 1, 2, 2, 2, 2, 3, 6, 2, 4, 5, 7, 8, 8, 1, 2, 2, 7, 8, 9, 10, 10, 1, 1, 1, 3, 4, 5, 2, 6, 7]);
  // Facts up to 10, like on the path, pay 1 to 5 coins
  const path = await page.evaluate(() => [...new Set(FACT_KEYS.filter(k => Math.max(...factsOf(k)) <= 10).map(k => centsFor(...factsOf(k))))]);
  expect(path.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  // Every pay from 1 to 10 coins is used
  const all = await page.evaluate(() => [...new Set(FACT_KEYS.map(k => centsFor(...factsOf(k))))]);
  expect(all.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('right answer adds the shown pay, wrong answer costs nothing', async ({ page }) => {
  await page.locator('#pathBtn').click();

  const cents = await page.evaluate(() => centsFor(game.a, game.b));
  await expect(page.locator('#worth')).toHaveText(`This one pays ${coins(cents)}!`);
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText(coins(cents));

  await page.waitForTimeout(2000); // next question
  await answer(page, false);
  await expect(page.locator('#gameBankAmount')).toHaveText(coins(cents));
});

test('trade in takes part or all of the balance, keeps the totals, and survives reload', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 1340; saveState(); });
  await page.reload();
  await expect(page.locator('#cashoutBtn')).toHaveText('🐷 Trade In');

  await page.locator('#cashoutBtn').click();
  await expect(page.locator('#cashoutScreen')).toHaveClass(/active/);
  await expect(page.locator('#cashoutScreen h1')).toHaveText('Trade In 🐷');
  await expect(page.locator('#cashBankAmount')).toHaveText('1,340 coins');
  await expect(page.locator('#payAmount')).toHaveValue('1340');
  await expect(page.locator('.payout-row, #payoutList')).toHaveCount(0);

  // Part of the balance
  const payBtn = page.locator('#payBtn');
  await expect(payBtn).toHaveText('Trade in 1,340 coins');
  await page.locator('#payAmount').fill('1000');
  await expect(payBtn).toHaveText('Trade in 1,000 coins');
  await payBtn.click(); // only asks to confirm
  await expect(page.locator('#payAsk')).toHaveText('Did you trade in 1,000 coins?');
  await expect(page.locator('#cashBankAmount')).toHaveText('1,340 coins');
  await page.locator('#payYesBtn').click();
  await expect(page.locator('#cashBankAmount')).toHaveText('340 coins');
  await expect(page.locator('#statPaid')).toHaveText('1,000 coins');
  await expect(page.locator('#statAllTime')).toHaveText('1,340 coins');
  await expect(page.locator('#payAmount')).toHaveValue('340');

  // More than the balance, none, or part of a coin cannot be traded
  for (const bad of ['341', '0', '', '2.5']) {
    await page.locator('#payAmount').fill(bad);
    await expect(payBtn).toBeDisabled();
    await expect(payBtn).toHaveText('Pick 1 to 340 coins');
  }

  // The rest
  await page.locator('#payAmount').fill('340');
  await payBtn.click();
  await expect(page.locator('#payYesBtn')).toBeEnabled({ timeout: 2000 });
  await page.locator('#payYesBtn').click();
  await expect(page.locator('#cashBankAmount')).toHaveText('0 coins');
  await expect(page.locator('#statPaid')).toHaveText('1,340 coins');
  await expect(page.locator('#statAllTime')).toHaveText('1,340 coins');
  await expect(page.locator('#payPick')).toBeHidden();
  await expect(payBtn).toBeVisible();
  await expect(payBtn).toBeDisabled();
  await expect(payBtn).toHaveText('No coins to trade in yet');
  // No new payout rows: only the totals are kept
  expect(await page.evaluate(() => state.payouts.length)).toBe(0);

  await page.reload();
  await page.locator('#cashoutBtn').click();
  await expect(page.locator('#statPaid')).toHaveText('1,340 coins');
  await page.locator('#cashBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
  await expect(page.locator('#startBankAmount')).toHaveText('0 coins');
});

test('a quick double tap on Trade in does not trade; Not yet cancels', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 250; saveState(); });
  await page.reload();
  await page.locator('#cashoutBtn').click();
  await page.locator('#payBtn').click();
  // "Yes, traded" sits under where Trade in was, and stays off for a second.
  await expect(page.locator('#payYesBtn')).toBeDisabled();
  await page.locator('#payYesBtn').click({ force: true });
  await expect(page.locator('#cashBankAmount')).toHaveText('250 coins');
  await page.locator('#payNoBtn').click();
  await expect(page.locator('#payConfirm')).toBeHidden();
  await expect(page.locator('#payBtn')).toHaveText('Trade in 250 coins');
  expect(await page.evaluate(() => state.paidCents)).toBe(0);

  await page.locator('#payBtn').click();
  await expect(page.locator('#payYesBtn')).toBeEnabled({ timeout: 2000 });
  await page.locator('#payYesBtn').click();
  await expect(page.locator('#cashBankAmount')).toHaveText('0 coins');
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

test('a right answer after the picture pays 1 coin whatever the factors', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 50; saveState(); });
  await page.reload();
  await page.locator('#pathBtn').click();

  // Hint button after one miss
  await askFact(page, 7, 8);
  await answer(page, false);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#worth')).toHaveText('With the picture, this one pays 1 coin');
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('51 coins'); // 50 + 1

  // Count-together picture after two misses
  await page.waitForTimeout(2200);
  await askFact(page, 9, 9);
  await answer(page, false);
  await answer(page, false);
  await expect(page.locator('#gridArea')).toBeVisible();
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('52 coins'); // 51 + 1
});

test('0 facts come up as often as other facts, pay 1 coin, and the picture shows no dots', async ({ page }) => {
  const n = await page.evaluate(() => {
    startRound('main');
    Object.assign(game, { index: game.slots.indexOf('N'), asked: new Set(), prevKey: null });
    const n = { '0x2': 0, '1x2': 0 };
    for (let i = 0; i < 6000; i++) { const k = keyOf(pickQuestion()); if (k in n) n[k]++; }
    goHome();
    return n;
  });
  expect(n['0x2']).toBeGreaterThan(n['1x2'] * 0.7);
  expect(n['0x2']).toBeLessThan(n['1x2'] * 1.4);

  await page.locator('#pathBtn').click();
  await askFact(page, 0, 7);
  await answer(page, false);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#arrayGrid .zero-note')).toContainText('0');
  await answer(page, true);
  await expect(page.locator('#feedback')).toHaveText('0 × 7 = 0 ✓');
  await expect(page.locator('#gameBankAmount')).toHaveText('1 coin');
});

test('a save in another tab is not undone by this tab', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/multiplication-ms-menna.html');
  await other.evaluate(() => { state.totalCents = 500; state.gems = 3; saveState(); });

  await expect(page.locator('#startBankAmount')).toHaveText('500 coins');
  await expect(page.locator('#pomStart .gem-badge')).toHaveText('💎 3');
  await page.evaluate(() => changeBank(7));
  await other.reload();
  await expect(other.locator('#startBankAmount')).toHaveText('507 coins');
  expect(await other.evaluate(() => state.gems)).toBe(3);
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

test('a tab that missed another tab\'s trade-in cannot trade it again, and adds to it instead of undoing it', async ({ page }) => {
  await page.evaluate(() => { state.totalCents = 500; state.gems = 4; saveState(); });
  await page.evaluate(() => { showCashout(); onPayTap(); }); // the stale tab is asking "Did you trade in 500 coins?"
  await saveFromOtherTab(page, () => ({ totalCents: 0, paidCents: 500, gems: 2, payouts: [{ t: Date.now(), c: 500 }] }));
  expect(await snapshot(page)).toEqual({ cents: 500, paid: 0, gems: 4, payouts: 0 }); // still stale

  await page.evaluate(() => onPayYes());
  expect(await snapshot(page)).toEqual({ cents: 0, paid: 500, gems: 2, payouts: 1 }); // took the other save, paid nothing
  await page.evaluate(() => { changeBank(7); state.gems += 1; saveState(); });
  expect(await snapshot(page)).toEqual({ cents: 7, paid: 500, gems: 3, payouts: 1 });
});

test('a stale tab cannot spend gems the other tab already spent', async ({ page }) => {
  await page.evaluate(() => { state.gems = 20; saveState(); });
  await page.locator('#houseBtn').click();
  await page.evaluate(() => { for (let i = 0; i < 20; i++) state.mastery[i] = STICKER_AT; showHouse(); });
  await page.locator('#furnItems .item[data-id="bed"]').click();
  await page.locator('#furnColors .color-btn[data-id="bed"]').click();
  // The other tab spent 10 of the 20 gems on a lamp, so the 15-gem bed is too much now.
  await saveFromOtherTab(page, () => ({ gems: 10, furniture: encodeOwned(FURNITURE, ['lamp']) }));
  await page.locator('#furnBuyBtn').click();
  expect(await page.evaluate(() => ({ gems: state.gems, furniture: state.furniture }))).toEqual({ gems: 10, furniture: ['lamp'] });
  await expect(page.locator('.house-head .gem-badge')).toHaveText('💎 10');
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
    await expect(page.locator('#gameBubble')).not.toContainText('in a row'); // a surprise trick may play, but no streak trick
    await page.waitForTimeout(1400);
  }
  await answer(page, true);
  await expect(page.locator('#pomGame')).toHaveClass(/trick-spin/);
  await expect(page.locator('#gameBubble')).toContainText('3 in a row');
});

test('her body parts settle after every move, even one cut short, and wag only on the showing screen', async ({ page }) => {
  const left = await page.evaluate(async () => {
    // Her moves play 8 times faster here, and the waits shrink to match.
    const fast = 8;
    gsap.globalTimeline.timeScale(fast);
    const sleep = ms => new Promise(r => setTimeout(r, ms / fast));
    const el = $('pomStart');
    el.blink.kill();
    const b = pomBody(el);
    const out = [];
    // Each move is cut short by itself, then plays to the end.
    for (const n of Object.keys(POM_MOVES).filter(n => n !== 'walking')) {
      pomMove(el, n); await sleep(150); pomMove(el, n);
      await sleep(el.move.duration() * 1000 + 400);
      for (const [part, node] of Object.entries(b)) {
        if (part === 'tail') continue;
        const off = ['rotation', 'x', 'y'].map(p => gsap.getProperty(node, p)).concat(gsap.getProperty(node, 'scaleY') - 1);
        if (off.some(v => Math.abs(v) > 0.01)) out.push(`${n}: ${part}`);
      }
    }
    showScreen('closetScreen');
    if (!el.idle.paused()) out.push('start screen still wags while hidden');
    showScreen('startScreen');
    if (el.idle.paused()) out.push('start screen does not wag again');
    return out;
  });
  expect(left).toEqual([]);
});

test('with Reduce Motion on, she only blinks, and wags again when it is turned off', async ({ page }) => {
  // The page hears about the setting a moment after Playwright changes it.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => !!$('pomStart').idle)).toBe(false);
  const calm = await page.evaluate(() => {
    const el = $('pomStart');
    pomMove(el, 'happy');
    return { move: !!el.move, wag: !!el.idle, blink: !!el.blink };
  });
  expect(calm).toEqual({ move: false, wag: false, blink: true });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => !!$('pomStart').idle && !$('pomStart').idle.paused())).toBe(true);
  expect(await page.evaluate(() => { const el = $('pomStart'); pomMove(el, 'happy'); return !!el.move; })).toBe(true);
});

test('the sticker chart has times and divide pages, each with a 0–10 and an 11–20 view', async ({ page }) => {
  await page.evaluate(() => {
    for (const k of ['3x7', '4x17', '17x4', '0x0', 'd7x8', 'd2x2', 'd3x15']) state.mastery[FACT_INDEX[k]] = 3;
    state.mastery[FACT_INDEX['2x5']] = 1;
    saveState();
  });
  await page.locator('#stickersBtn').click();
  await expect(page.locator('#stickerCount')).toHaveText('2 of 121 stickers');
  // 0 to 10 plus headings is a 12×12 grid; 3×7 has a sticker and 7×3 has its own, not earned yet
  await expect(page.locator('#stickerGrid > div')).toHaveCount(12 * 12);
  await expect(page.locator('#stickerGridMore')).toBeHidden();
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(2);
  await expect(page.locator('#stickerGrid > .got[title="3 × 7 = 21"]')).toHaveCount(1);
  await expect(page.locator('#stickerGrid > .got[title="7 × 3 = 21"]')).toHaveCount(0);
  await expect(page.locator('#stickerGrid > div').nth(1)).toHaveText('0');
  await expect(page.locator('#stickerGrid .dots')).toHaveCount(1); // 2 × 5 only; 5 × 2 has its own dots

  // 11–20: columns 11–20 for rows 0–20, then rows 11–20 for columns 0–10
  await page.locator('#tabHigh').click();
  await expect(page.locator('#stickerCount')).toHaveText('2 of 320 stickers');
  await expect(page.locator('#stickerGrid > div')).toHaveCount(22 * 11);
  await expect(page.locator('#stickerGridMore > div')).toHaveCount(11 * 12);
  await expect(page.locator('#stickerGrid > .got[title="4 × 17 = 68"]')).toHaveCount(1);
  await expect(page.locator('#stickerGridMore > .got[title="17 × 4 = 68"]')).toHaveCount(1);

  // No 0 row or column on the divide page. 56 ÷ 7 and 56 ÷ 8 each have a sticker.
  await page.locator('#tabDivide').click();
  await expect(page.locator('#stickerCount')).toHaveText('1 of 300 stickers');
  await expect(page.locator('#stickerGridMore > div')).toHaveCount(11 * 11);
  await page.locator('#tabLow').click();
  await expect(page.locator('#tabLow')).toHaveText('1–10');
  await expect(page.locator('#stickerCount')).toHaveText('2 of 100 stickers');
  await expect(page.locator('#stickerGrid > div')).toHaveCount(11 * 11);
  await expect(page.locator('#stickerGridMore')).toBeHidden();
  await expect(page.locator('#stickerGrid > div').nth(1)).toHaveText('1');
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(2); // 56 ÷ 7 and 4 ÷ 2
  await expect(page.locator('#stickerGrid > .got[title="56 ÷ 7 = 8"]')).toHaveCount(1);
  await expect(page.locator('#stickerGrid > .got[title="56 ÷ 8 = 7"]')).toHaveCount(0);
  await expect(page.locator('#stickerShare')).toHaveText('56 ÷ 7 and 56 ÷ 8 each have a sticker!');
  await page.locator('#stickerBackBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
});

test('the Garden style shows each fact as a plant, and the choice is remembered on this device', async ({ page }) => {
  await page.evaluate(() => {
    state.mastery[FACT_INDEX['3x7']] = 3;
    state.mastery[FACT_INDEX['2x5']] = 1;
    state.mastery[FACT_INDEX['4x6']] = 2;
    saveState();
  });
  const save = await page.evaluate(() => localStorage.getItem(STORE_KEY));
  await page.locator('#stickersBtn').click();
  await expect(page.locator('#tabStickers')).toHaveClass(/active/);
  await expect(page.locator('#stickerGrid svg')).toHaveCount(0);
  await page.locator('#tabGarden').click();
  await expect(page.locator('#stickerGrid')).toHaveClass(/garden/);
  await expect(page.locator('#stickerGrid > div:not(.head):not(.corner) svg')).toHaveCount(121);
  await expect(page.locator('#stickerGrid > .got')).toHaveCount(1);
  await expect(page.locator('#stickerGrid > .got[title="3 × 7 = 21"]')).toHaveCount(1);
  await expect(page.locator('#stickerGrid > .almost')).toHaveCount(1);
  await expect(page.locator('#stickerGrid > .almost[title="4 × 6"]')).toHaveCount(1);
  await expect(page.locator('#stickerCount')).toHaveText('1 of 121 plants grown');
  await expect(page.locator('#chartTitle')).toHaveText('Garden 🌱');
  await expect(page.locator('#gardenHelp')).toBeVisible();
  await expect(page.locator('#stickerHelp')).toBeHidden();
  // A fact with no dots is bare soil; the first dot makes a sprout
  await expect(page.locator('#stickerGrid > div[title="2 × 6"] svg path')).toHaveCount(0);
  await expect(page.locator('#stickerGrid > div[title="2 × 5"] svg path')).not.toHaveCount(0);
  // The 11–20 page and the divide page grow plants too
  await page.locator('#tabHigh').click();
  await expect(page.locator('#stickerGridMore > div:not(.head):not(.corner) svg')).toHaveCount(110);
  // The choice is a device setting, so the save itself doesn't change
  expect(await page.evaluate(() => localStorage.getItem(STORE_KEY + '_chartStyle'))).toBe('garden');
  expect(await page.evaluate(() => localStorage.getItem(STORE_KEY))).toBe(save);
  await page.reload();
  await page.locator('#stickersBtn').click();
  await expect(page.locator('#tabGarden')).toHaveClass(/active/);
  await page.locator('#tabStickers').click();
  await expect(page.locator('#stickerGrid svg')).toHaveCount(0);
  await expect(page.locator('#gardenHelp')).toBeHidden();
  await expect(page.locator('#stickerCount')).toHaveText('1 of 121 stickers');
  await expect(page.locator('#chartTitle')).toHaveText('Sticker Chart ⭐');
});

test('a right answer earns the third dot and a sticker; a wrong one keeps the dots', async ({ page }) => {
  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.locator('#pathBtn').click();
  await askOneTimesOne(page);
  await answer(page, true);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x1']])).toBe(3);
  await expect(page.locator('.banner')).toContainText('New sticker: 1 × 1');

  await page.evaluate(() => { state.mastery[FACT_INDEX['1x1']] = 2; });
  await page.waitForTimeout(1900);
  await page.evaluate(() => { state.days[FACT_INDEX['1x1']] = today() - 1; });
  await askOneTimesOne(page);
  const cents = await page.evaluate(() => state.totalCents);
  await answer(page, false);
  expect(await page.evaluate(() => {
    const i = FACT_INDEX['1x1'];
    return [state.mastery[i], state.days[i] === today(), weightOf('1x1') > 1, game.retries.filter(r => r.key === '1x1').length, state.totalCents];
  })).toEqual([2, true, true, 1, cents]); // the sticker waits for another day
  // Right after the miss, it is practice: no dot this round
  await answer(page, true);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x1']])).toBe(2);
  // A miss on 1 dot keeps the dot too, and its next dot waits for another day
  await page.waitForTimeout(2100);
  await page.evaluate(() => { state.mastery[FACT_INDEX['2x2']] = 1; state.days[FACT_INDEX['2x2']] = today() - 3; });
  await askFact(page, 2, 2);
  await answer(page, false);
  expect(await page.evaluate(() => [state.mastery[FACT_INDEX['2x2']], state.days[FACT_INDEX['2x2']] === today()])).toEqual([1, true]);
});

test('2 dots on day 1, a miss on day 2 keeps them, and the sticker comes on day 3', async ({ page }) => {
  await setFact(page, '6x7', 2, 1); // two dots yesterday
  await page.locator('#pathBtn').click();
  await askFact(page, 6, 7);
  await answer(page, false); // day 2: a miss on the first ask
  await answer(page, true);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['6x7']])).toBe(2);
  // A later round on day 2: right first time, but the sticker waits for tomorrow
  await page.evaluate(() => { clearTimers(); goHome(); });
  await page.locator('#pathBtn').click();
  await askFact(page, 6, 7);
  await answer(page, true);
  await expect(page.locator('#gameBubble')).toContainText('tomorrow');
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['6x7']])).toBe(2);
  // Day 3: right first time earns the sticker
  await page.evaluate(() => { clearTimers(); goHome(); const d = today(); window.today = () => d + 1; });
  await page.locator('#pathBtn').click();
  await askFact(page, 6, 7);
  await answer(page, true);
  await expect(page.locator('.banner')).toContainText('New sticker: 6 × 7');
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['6x7']])).toBe(3);
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
    m87: state.mastery[FACT_INDEX['8x7']], m96: state.mastery[FACT_INDEX['9x6']],
    learned: state.mastery.filter(m => m === 3).length, w78: state.weights['7x8'], w87: state.weights['8x7'], w1213: state.weights['12x13'],
  }));
  // A shared sticker from before v25 goes to both 7 × 8 and 8 × 7
  expect(loaded).toEqual({
    cents: 437, paid: 120, gems: 9, owned: ['party', 'choc'], worn: { hat: 'party', fur: 'choc' },
    m78: 3, m1313: 3, m69: 2, m87: 3, m96: 2, learned: 3, w78: 5.5, w87: 5.5, w1213: 3,
  });

  // Loading saved it again in the newest format. It still starts with the v11 sticker string, so an old tab still open reads it right
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(STORE_KEY)));
  expect(saved.v).toBe(await page.evaluate(() => SAVE_VERSION));
  expect(saved.mastery.slice(0, 91)).toBe(old);
  expect(saved.mastery).toHaveLength(841);
  await page.reload();
  expect(await page.evaluate(() => [state.weights['7x8'], state.weights['12x13'], state.weights['1x1']])).toEqual([5.5, 3, undefined]);
});

test('a missed fact comes back later in the same round', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await page.evaluate(() => { game.peekNow = false; }); // a missed sneak peek has no retry
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
  await expect(page.locator('#gameBankAmount')).toHaveText(coins(cents));

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
  await expect(page.locator('#buyBtn')).toHaveText('Need 78 more 💎');

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

test('an item owned in every color is saved with each color, so older versions read it, and `.*` still loads', async ({ page }) => {
  const r = await page.evaluate(() => {
    const all = ITEMS.party.colors.map(c => c.id);
    const furn = FURN.rug.colors.filter(c => c.color).map(c => c.id);
    return {
      all: encodeOwned(CLOSET, all), some: encodeOwned(CLOSET, ['party.r', 'party.g']),
      star: decodeOwned('party,party.*').sort().join() === [...all].sort().join(), furnStar: decodeOwned('rug.*', FURN).length,
      old: decodeOwned('party.rgbpknwsoy').length,
    };
  });
  expect(r).toEqual({ all: 'party,party.roygbpknws', some: 'party.rg', star: true, furnStar: 10, old: 10 });
});

// The items saved as bits, in the order saves have them since v50. Never change this list except to add to its end.
const PACKED_SINCE_V50 = [
  'dinohood', 'unicorn', 'flowers', 'astro', 'antenna', 'pirate', 'firehat', 'racing', 'stars', 'patch', 'mask', 'goggles',
  'lei', 'spikes', 'jetpack', 'butterfly', 'dino', 'rocket', 'truck', 'chest',
  'dinosuit', 'unisuit', 'astrosuit', 'robosuit', 'piratesuit', 'firesuit', 'racesuit', 'herosuit', 'fairydress', 'buttersuit',
  'chefsuit', 'wizrobe', 'cowvest', 'gown',
  'beesuit', 'bugears', 'beewings', 'ladysuit', 'ladyshell', 'lionmane', 'lionsuit', 'liontail', 'bunears', 'bunsuit', 'buntail',
  'catears', 'catsuit', 'cattail', 'bearears', 'bearsuit', 'froghood', 'frogsuit', 'draghorns', 'dragsuit', 'dragwings',
  'mersuit', 'shelltiara', 'penghood', 'pengsuit',
  'necklace', 'backpack', 'watch', 'bracelet', 'helpervest',
];

test('the bit list of owned items only ever grows at the end, and holds every closet item added since v49', async ({ page }) => {
  const now = await page.evaluate(() => ({ order: PACK_ORDER, colors: PACK_COLORS, codes: COLORS.map(c => c.code).join(''), ids: CLOSET.map(i => i.id) }));
  expect(now.order.slice(0, PACKED_SINCE_V50.length)).toEqual(PACKED_SINCE_V50);
  expect(new Set(now.order).size).toBe(now.order.length);
  expect(now.colors).toBe('roygbpknws');
  expect(now.codes).toBe(now.colors);
  const v49 = require('child_process').execSync('git show d00e18f:multiplication-ms-menna.html', { cwd: require('path').resolve(__dirname, '..') }).toString();
  const old = new Set([...v49.matchAll(/\{ id: '([a-z0-9]+)', slot: '/g)].map(m => m[1]));
  expect(now.ids.filter(id => !old.has(id) && !now.order.includes(id))).toEqual([]);
  expect(now.order.filter(id => old.has(id))).toEqual([]);
});

test('items saved as bits come back in every color, and the cookie lists them only as bits', async ({ page }) => {
  const r = await page.evaluate(() => {
    const packed = Object.values(ITEMS).filter(i => PACK_ORDER.includes(i.base) && i.price > 0).map(i => i.id);
    const same = (a, b) => [...a].sort().join() === [...b].sort().join();
    let seed = 3;
    const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
    const mixes = Array.from({ length: 50 }, () => packed.filter(() => !rnd(3 + rnd(5))));
    state.owned = ['party.r', ...packed];
    saveState();
    const local = JSON.parse(localStorage.getItem(STORE_KEY));
    const cookie = readCookie();
    return {
      count: packed.length, all: same(decodePacked(encodePacked(packed)), packed), none: encodePacked([]),
      mixes: mixes.every(m => same(decodePacked(encodePacked(m)), m)),
      cookieBits: cookie.ownBits === local.ownBits && same(decodePacked(cookie.ownBits), packed),
      cookieNames: cookie.owned, localNames: decodeOwned(local.owned).length, bitsSize: local.ownBits.length,
    };
  });
  expect(r.count).toBeGreaterThan(200);
  expect(r).toMatchObject({ all: true, none: '', mixes: true, cookieBits: true, cookieNames: 'party.r', localNames: r.count + 1 });
  expect(r.bitsSize).toBeLessThanOrEqual(Math.ceil(PACKED_SINCE_V50.length * 11 / 6));

  // The cookie alone brings them all back
  await clearAllButCookie(page);
  await page.reload();
  expect(await page.evaluate(() => state.owned.length)).toBe(r.count + 1);
});

test('items an older version dropped and saved over come back from the kept copy, in localStorage or IndexedDB', async ({ page }) => {
  const owned = await page.evaluate(() => {
    state.owned = ['party', 'party.r', 'dinohood.b', 'helpervest'];
    state.furniture = ['rug.g'];
    saveState();
    return [...state.owned].sort();
  });
  // An older version saves over all three copies with only the items it knows.
  const oldSave = () => page.evaluate(async () => {
    const json = JSON.stringify({ v: 26, owned: 'party,party.r', furniture: '', gems: 5, savedAt: Date.now() + 60000 });
    localStorage.setItem(STORE_KEY, json);
    await SaveDB.write(json);
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
  });
  const loaded = () => page.evaluate(() => ({ owned: [...state.owned].sort(), furniture: state.furniture, gems: state.gems }));
  await page.waitForTimeout(300);
  await oldSave();
  await page.reload();
  expect(await loaded()).toEqual({ owned, furniture: ['rug.g'], gems: 5 });

  // localStorage cleared too: the IndexedDB kept copy brings them back.
  await oldSave();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect.poll(loaded).toEqual({ owned, furniture: ['rug.g'], gems: 5 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(KEPT_KEY)).owned.length)).toBe(4);
});

test('bits for items this version does not know are kept when it saves, and broken bits change nothing', async ({ page }) => {
  const r = await page.evaluate(() => {
    // A later version's save: two more items after the end of the list, one owned in classic and pink
    const later = (PACK_ORDER.length + 1) * PACK_BITS;
    const bits = Array(later + PACK_BITS).fill(0);
    bits[0] = 1; // the classic Dino Hood
    bits[later] = bits[later + 7] = 1;
    const text = bits.join('').replace(/0+$/, '').padEnd(Math.ceil((later + 8) / 6) * 6, '0').match(/.{6}/g)
      .map(b => PACK_CHARS[parseInt(b, 2)]).join('');
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: SAVE_VERSION, owned: 'party.r', ownBits: text, savedAt: Date.now() + 1000 }));
    Object.assign(state, parseSave(readLocal()));
    state.owned.push('unicorn.k');
    saveState();
    const back = packBits(readCookie().ownBits);
    const broken = parseSave({ owned: 'party.r', ownBits: 'ab!c' });
    return {
      owned: [...state.owned].sort(), later: back[later] === 1 && back[later + 7] === 1 && back.slice(later).filter(Boolean).length === 2,
      unicorn: back[PACK_ORDER.indexOf('unicorn') * PACK_BITS + 7], broken: broken.owned, brokenBits: broken.ownBits,
    };
  });
  expect(r).toEqual({ owned: ['dinohood', 'party.r', 'unicorn.k'], later: true, unicorn: 1, broken: ['party.r'], brokenBits: '' });
});

test('saved progress still fits in the cookie mirror', async ({ page }) => {
  // Many seeds of the worst case, the same every run, so a cookie that grows too big fails every time
  for (let seed = 1; seed <= 40; seed++) await checkCookieMirror(page, seed);
});

async function checkCookieMirror(page, seed) {
  const cookie = await page.evaluate(seed => {
    Object.assign(state, defaultState());
    // Random values, because the cookie is compressed and repeated ones would fit too easily
    const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
    const playAll = keys => keys.forEach(k => {
      const i = FACT_INDEX[k];
      state.mastery[i] = rnd(STICKER_AT + 1); state.days[i] = today() - rnd(today() - 1); state.levels[i] = rnd(SLEEPY_NOW + 1);
      state.weights[k] = 1.25 + rnd(44) / 4; // on the 0.25 steps the save keeps
    });
    const cookieNow = () => {
      const raw = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
      return { size: raw ? raw[0].length : 0, saved: raw && readCookie() };
    };
    state.payouts = Array.from({ length: MAX_PAYOUTS_KEPT }, (_, i) => ({ t: Date.now() - i * 86400000 - rnd(99999), c: 100 + rnd(2000) }));
    state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
    state.worn = { hat: 'crown.s', face: 'hearts', neck: 'medal', back: 'cape', fur: 'pink' };
    state.gems = 99999;
    state.furniture = FURNITURE.flatMap(f => Object.values(FURN).filter(p => p.base === f.id && p.price > 0).map(p => p.id));
    // Every Learning Path fact played: the whole save fits, but for the old payout list
    playAll(MAIN_KEYS);
    saveState();
    const path = cookieNow();
    const local = JSON.parse(localStorage.getItem(STORE_KEY));
    // The cookie leaves out the old payout list, and keeps the rest
    const pathSame = !!path.saved && path.saved.review === local.review && path.saved.weights === local.weights
      && path.saved.mastery === local.mastery && path.saved.gems === local.gems && path.saved.paidCents === local.paidCents
      && path.saved.partial === true && path.saved.payouts.length === 0 && !('pays' in path.saved) && local.payouts.length > 0;
    // Every fact up to 20 played: the cookie leaves out review dates and weights above 10, and keeps the rest
    playAll(FACT_KEYS);
    state.gems = 4321;
    saveState();
    const all = cookieNow();
    const full = JSON.parse(localStorage.getItem(STORE_KEY));
    const fromCookie = parseSave(all.saved);
    const high = FACT_KEYS.map((k, i) => i).filter(i => Math.max(...factsOf(FACT_KEYS[i])) > 10);
    const low = MAIN_KEYS.map(k => FACT_INDEX[k]);
    return {
      path: path.size, pathSame, all: all.size, partial: all.saved.partial, gems: all.saved.gems, mastery: all.saved.mastery === full.mastery,
      lowKept: low.every(i => fromCookie.days[i] === state.days[i] && fromCookie.levels[i] === state.levels[i]
        && fromCookie.weights[FACT_KEYS[i]] === state.weights[FACT_KEYS[i]]),
      // A sticker there gets a first visit soon, like stickers from before v19
      highDropped: high.every(i => !fromCookie.weights[FACT_KEYS[i]]
        && fromCookie.levels[i] === (state.mastery[i] >= STICKER_AT ? 2 : 0)),
    };
  }, seed);
  expect(cookie.path, `seed ${seed}`).toBeLessThan(4096);
  expect(cookie.pathSame, `seed ${seed}`).toBe(true);
  expect(cookie.all, `seed ${seed}`).toBeLessThan(4096);
  expect(cookie, `seed ${seed}`).toMatchObject({ partial: true, gems: 4321, mastery: true, lowKept: true, highDropped: true });
}

test('a much bigger house still fits in the cookie, with every sticker, coin, gem, item and piece of furniture', async ({ page }) => {
  const out = await page.evaluate(() => {
    const rnd = n => Math.floor(Math.random() * n);
    // Many more pieces than the game has, each owned in every color, so the cookie needs its last trims
    for (let n = 0; n < 60; n++) {
      const f = { ...FURNITURE[n % FURNITURE.length], id: 'extra' + n };
      f.base = f.id;
      f.colors = [f, ...COLORS.map(c => ({ ...f, id: f.id + '.' + c.code, color: c }))];
      FURNITURE.push(f);
      f.colors.forEach(c => { FURN[c.id] = c; });
    }
    FACT_KEYS.forEach((k, i) => {
      state.mastery[i] = rnd(STICKER_AT + 1); state.days[i] = today() - rnd(today() - 1); state.levels[i] = rnd(SLEEPY_NOW + 1);
      state.weights[k] = 1.25 + rnd(44) / 4;
    });
    state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
    state.furniture = Object.values(FURN).filter(p => p.price > 0).map(p => p.id);
    state.treats = Object.fromEntries(TREATS.map(t => [t.id, 99]));
    Object.assign(state, { totalCents: 12345, paidCents: 6789, gems: 4321 });
    saveState();
    const raw = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
    const back = parseSave(readCookie());
    return {
      size: raw[0].length,
      mastery: back.mastery.join('') === state.mastery.join(''),
      owned: back.owned.length === state.owned.length,
      furniture: back.furniture.length === state.furniture.length,
      money: [back.totalCents, back.paidCents, back.gems],
      treats: back.treats.cake,
    };
  });
  expect(out.size).toBeLessThan(4096);
  expect(out).toMatchObject({ mastery: true, owned: true, furniture: true, money: [12345, 6789, 4321], treats: 99 });
});

// A warning before the cookie runs out of room: with everything this version sells, it must leave space for later ones.
test('the cookie with everything the game has stays under 3,600 bytes', async ({ page }) => {
  const out = await page.evaluate(() => {
    FACT_KEYS.forEach((k, i) => {
      state.mastery[i] = STICKER_AT; state.days[i] = today() - 400 + i; state.levels[i] = SLEEPY_NOW;
      state.weights[k] = 12.25;
    });
    state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
    state.furniture = Object.values(FURN).filter(p => p.price > 0).map(p => p.id);
    state.treats = Object.fromEntries(TREATS.map(t => [t.id, 99]));
    Object.assign(state, { totalCents: 999999, paidCents: 999999, gems: 99999 });
    saveState();
    const raw = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
    const back = parseSave(readCookie());
    return { size: raw[0].length, owned: back.owned.length === state.owned.length, furniture: back.furniture.length === state.furniture.length };
  });
  expect(out.size).toBeLessThan(3600);
  expect(out).toMatchObject({ owned: true, furniture: true });
});

test('closet colors save compactly, and v12 saves keep their items', async ({ page }) => {
  // A v12 save lists plain item ids
  await page.evaluate(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ gems: 40, owned: 'party,ball,choc', worn: { hat: 'party', fur: 'choc' }, savedAt: Date.now() }));
  });
  await page.reload();
  expect(await page.evaluate(() => ({ owned: state.owned, worn: state.worn, gems: state.gems })))
    .toEqual({ owned: ['party', 'ball', 'choc'], worn: { hat: 'party', fur: 'choc' }, gems: 40 });

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
  await expect(page.locator('#startBankAmount')).toHaveText('777 coins');
  expect(await page.evaluate(() => state.gems)).toBe(42);
});

test('a trimmed cookie alone brings back every sticker, dot and gem', async ({ page }) => {
  const before = await page.evaluate(async () => {
    const rnd = n => Math.floor(Math.random() * n);
    FACT_KEYS.forEach((k, i) => {
      state.mastery[i] = rnd(STICKER_AT + 1); state.days[i] = today() - rnd(today() - 1); state.levels[i] = rnd(SLEEPY_NOW + 1);
      state.weights[k] = 1.25 + rnd(44) / 4;
    });
    state.gems = 77; state.totalCents = 456;
    saveState();
    // Only the cookie is left
    localStorage.clear();
    (await SaveDB.open()).close();
    await new Promise(resolve => { const req = indexedDB.deleteDatabase(STORE_KEY); req.onsuccess = req.onerror = resolve; });
    return { partial: readCookie().partial, mastery: state.mastery.join(''), keep: MAIN_KEYS.map(k => state.days[FACT_INDEX[k]]) };
  });
  expect(before.partial).toBe(true);
  await page.reload();
  await expect(page.locator('#startBankAmount')).toHaveText('456 coins');
  const after = await page.evaluate(() => ({
    gems: state.gems, mastery: state.mastery.join(''), keep: MAIN_KEYS.map(k => state.days[FACT_INDEX[k]]),
  }));
  expect(after).toEqual({ gems: 77, mastery: before.mastery, keep: before.keep });
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

// A released game, served from git next to this version so both share the same cookie and storage.
async function openRelease(page, commit, name) {
  const body = require('child_process').execSync(`git show ${commit}:multiplication-ms-menna.html`, { cwd: require('path').resolve(__dirname, '..') });
  await page.route(`**/menna-${name}.html`, route => route.fulfill({ contentType: 'text/html', body }));
  await page.goto(`/menna-${name}.html`);
  expect(await page.evaluate(() => SAVE_VERSION)).toBe(26);
}
const openV46 = page => openRelease(page, 'd74599d', 'v46');
const openV48 = page => openRelease(page, '52d3f91', 'v48');

// A big save a real child could have: every sticker, everything bought, 30 payouts, rooms, tricks and treats.
function fillSave(seed) {
  const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
  MAIN_KEYS.forEach(k => {
    const i = FACT_INDEX[k];
    state.mastery[i] = STICKER_AT; state.days[i] = today() - rnd(Math.min(365, today() - 1)); state.levels[i] = 1 + rnd(SLEEPY_NOW);
    if (rnd(3)) state.weights[k] = 1.25 + rnd(44) / 4;
  });
  state.payouts = Array.from({ length: MAX_PAYOUTS_KEPT }, (_, i) => ({ t: Date.UTC(2026, 9, 1) - i * 86400000 - rnd(99999), c: 100 + rnd(2000) }));
  state.owned = Object.values(ITEMS).filter(i => i.price > 0).map(i => i.id);
  state.worn = { hat: 'crown.s', face: 'hearts', neck: 'medal', back: 'cape', fur: 'pink' };
  state.furniture = FURNITURE.flatMap(f => Object.values(FURN).filter(p => p.base === f.id && p.price > 0).map(p => p.id));
  state.treats = Object.fromEntries(TREATS.map(t => [t.id, 1 + rnd(5)]));
  Object.assign(state, { gems: 1234, totalCents: 98765, paidCents: 54321, tricks: 'abc' });
  saveState();
}

// Everything a child would miss if it were lost
const saveSnapshot = () => {
  const sorted = list => [...list].sort();
  return {
    gems: state.gems, totalCents: state.totalCents, paidCents: state.paidCents, mastery: state.mastery.join(''),
    days: state.days.join(), levels: state.levels.join(), payouts: state.payouts, owned: sorted(state.owned),
    furniture: sorted(state.furniture), treats: state.treats, worn: state.worn, rooms: sorted(state.rooms), tricks: state.tricks,
  };
};

async function clearAllButCookie(page) {
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    localStorage.clear();
    (await SaveDB.open()).close();
    await new Promise(resolve => { const req = indexedDB.deleteDatabase(STORE_KEY); req.onsuccess = req.onerror = resolve; });
  });
}

test('a v46 cookie alone loads in this version with everything kept', async ({ page }) => {
  await openV46(page);
  await page.evaluate(fillSave, 7);
  const before = await page.evaluate(saveSnapshot);
  expect(await page.evaluate(() => readCookie().partial)).toBeFalsy();
  await clearAllButCookie(page);
  await page.goto('/multiplication-ms-menna.html');
  expect(await page.evaluate(saveSnapshot)).toEqual(before);
  // Saved again in this version and loaded from the cookie alone, only the old payout list is gone
  await page.evaluate(() => saveState());
  await clearAllButCookie(page);
  await page.reload();
  expect(await page.evaluate(saveSnapshot)).toEqual({ ...before, payouts: [] });
});

test('a v48 cookie with the short payout list keeps every payout here', async ({ page }) => {
  // The worst case on random values: every Learning Path fact played with a picker weight. Some seeds make the plain
  // v48 cookie too big, so it keeps the payout list short in `pays`.
  let tried = 0;
  for (let seed = 1, found = 0; found < 2; seed++) {
    expect(++tried, 'seeds tried').toBeLessThan(100);
    await openV48(page);
    await page.evaluate(() => Object.assign(state, defaultState()));
    await page.evaluate(fillSave, seed);
    await page.evaluate(seed => {
      const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
      MAIN_KEYS.forEach(k => {
        const i = FACT_INDEX[k];
        state.mastery[i] = rnd(STICKER_AT + 1); state.days[i] = today() - rnd(today() - 1); state.levels[i] = rnd(SLEEPY_NOW + 1);
        state.weights[k] = 1.25 + rnd(44) / 4;
      });
      state.gems = 99999;
      saveState();
    }, seed);
    if (typeof (await page.evaluate(() => readCookie())).pays !== 'string') continue;
    found++;
    const before = await page.evaluate(saveSnapshot);
    await clearAllButCookie(page);
    await page.goto('/multiplication-ms-menna.html');
    expect(await page.evaluate(saveSnapshot)).toEqual(before);
  }
});

test('the cookie leaves out the old payout list, and v46 still loads it with the list from IndexedDB', async ({ page }) => {
  // The worst case on random values: every Learning Path fact played with a picker weight.
  const bigSave = async seed => {
    await page.goto('/multiplication-ms-menna.html');
    await page.evaluate(() => Object.assign(state, defaultState()));
    await page.evaluate(fillSave, seed);
    await page.evaluate(seed => {
      const rnd = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
      MAIN_KEYS.forEach(k => {
        const i = FACT_INDEX[k];
        state.mastery[i] = rnd(STICKER_AT + 1); state.days[i] = today() - rnd(today() - 1); state.levels[i] = rnd(SLEEPY_NOW + 1);
        state.weights[k] = 1.25 + rnd(44) / 4;
      });
      state.gems = 99999;
      saveState();
    }, seed);
    return page.evaluate(() => readCookie());
  };
  const keep = ({ gems, totalCents, paidCents, mastery, days, levels, owned, furniture, treats, worn, tricks }) =>
    ({ gems, totalCents, paidCents, mastery, days, levels, owned, furniture, treats, worn, tricks });
  for (const seed of [1, 2, 3]) {
    const cookie = await bigSave(seed);
    expect(cookie.partial).toBe(true);
    expect(cookie.payouts).toEqual([]);
    expect(cookie.pays).toBeUndefined();
    const before = await page.evaluate(saveSnapshot);
    expect(before.payouts.length).toBe(30);

    // This version from the cookie alone: everything but the old payout list
    await clearAllButCookie(page);
    await page.reload();
    expect(await page.evaluate(saveSnapshot)).toEqual({ ...before, payouts: [] });

    // v46 from the cookie alone: every sticker, dot, coin, gem, and every item and color it knows.
    await bigSave(seed);
    await clearAllButCookie(page);
    await openV46(page);
    const old = await page.evaluate(saveSnapshot);
    expect(old.payouts).toEqual([]);
    const knownToV46 = await page.evaluate(() => ({ items: Object.keys(ITEMS), furn: Object.keys(FURN) }));
    expect(keep(old)).toEqual(keep({
      ...before,
      owned: before.owned.filter(id => knownToV46.items.includes(id)),
      furniture: before.furniture.filter(id => knownToV46.furn.includes(id)),
    }));

    // v46 with the IndexedDB copy still there: everything it knows about, every color and payouts included
    await bigSave(seed);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.clear());
    await openV46(page);
    await expect.poll(() => page.evaluate(() => state.payouts.length)).toBe(30);
    const v46Ids = await page.evaluate(() => ({ items: Object.keys(ITEMS), furn: Object.keys(FURN) }));
    expect(await page.evaluate(saveSnapshot)).toEqual({
      ...before,
      owned: before.owned.filter(id => v46Ids.items.includes(id)),
      furniture: before.furniture.filter(id => v46Ids.furn.includes(id)),
    });
  }
});

test('the house Ms. Menna stays inside the house, and waits in the locked Bedroom without walking', async ({ page }) => {
  // Even with the Bedroom locked on a new save, she must never land on the body.
  expect(await page.evaluate(() => houseWalker.el.parentElement.id)).toBe('houseRoom');
  await expect(page.locator('#pomHouse')).toBeHidden();
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseRoom')).toHaveClass(/locked/);
  await expect(page.locator('#pomHouse')).toBeVisible();
  await page.locator('#houseRoom').click({ position: { x: 20, y: 150 } });
  expect(await page.evaluate(() => [houseWalker.x, houseWalker.el.classList.contains('walking')])).toEqual([50, false]);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) state.mastery[i] = STICKER_AT; saveState(); });
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

  // The jar is in the House under the room, and works while the Bedroom is still locked
  await page.locator('#closetBackBtn').click();
  await expect(page.locator('#houseRoom')).toHaveClass(/locked/);
  await expect(page.locator('#treatJar .toy-btn')).toHaveCount(1);
  await expect(page.locator('#treatJar .count')).toHaveText('2');

  // Feeding uses one up, and the jar survives a reload
  await page.locator('#treatJar .toy-btn[data-id="cookie"]').click();
  await expect(page.locator('#pomHouse')).toHaveClass(/eating/);
  await expect(page.locator('#houseBubble')).toContainText('Cookie');
  await expect(page.locator('#treatJar .count')).toHaveText('1');
  await page.reload();
  expect(await page.evaluate(() => ({ treats: state.treats, gems: state.gems }))).toEqual({ treats: { cookie: 1 }, gems: 4 });
  await expect(page.locator('#startScreen #treatJar')).toHaveCount(0);
  await page.locator('#houseBtn').click();
  await page.locator('#treatJar .toy-btn').click();
  await expect(page.locator('#treatJar')).toBeHidden();
  expect(await page.evaluate(() => state.treats)).toEqual({});
});

test('Ms. Menna has no color that looks like the classic one, and keeps the old ones for anyone who bought them', async ({ page }) => {
  // Copies from v50 are gone. Copies that v48 sold are hidden, but kept so older saves don't lose them.
  const same = await page.evaluate(() => [...Object.values(ITEMS), ...Object.values(FURN)].filter(c => c.same).map(c => c.id).sort());
  expect(same).toEqual(['bandana.r', 'beanbag.p', 'drum.r', 'poolfloat.k', 'toybox.o']);
  expect(await page.evaluate(() => [ITEMS.dinohood.colors.length, 'dinohood.g' in ITEMS])).toEqual([10, false]);

  await page.evaluate(() => { state.gems = 500; saveState(); });
  await page.reload();
  await page.locator('#houseBtn').click();
  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="neck"]').click();
  await page.locator('.item[data-id="bandana"]').click();
  await expect(page.locator('.color-btn')).toHaveCount(10);
  await expect(page.locator('.color-btn[data-id="bandana.r"]')).toHaveCount(0);
  await expect(page.locator('#colorRow .color-title span')).toHaveText('0 of 10 are yours');

  // An older save that bought the copy still has it, and it still counts
  await page.evaluate(() => { state.owned.push('bandana.r'); state.worn.neck = 'bandana.r'; saveState(); });
  await page.reload();
  await page.locator('#houseBtn').click();
  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="neck"]').click();
  await expect(page.locator('.item[data-id="bandana"] .price')).toHaveText('🎨 1 of 11');
  await page.locator('.item[data-id="bandana"]').click();
  await expect(page.locator('.color-btn[data-id="bandana.r"] .price')).toHaveText('Wearing ✓');

  // The same goes for furniture
  const drum = await page.evaluate(() => [forSale(FURN.drum, ownsFurn).length, (state.furniture.push('drum.r'), forSale(FURN.drum, ownsFurn).length)]);
  expect(drum).toEqual([10, 11]);
});

test('Ms. Menna buys toys, plays with them, and uses them in streak tricks', async ({ page }) => {
  await page.evaluate(() => { state.gems = 30; state.totalCents = 90; saveState(); });
  await page.reload();
  await expect(page.locator('#toyShelf')).toBeHidden();

  await page.locator('#houseBtn').click();
  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="toy"]').click();
  await page.locator('.item[data-id="ball"]').click();
  await page.locator('.color-btn[data-id="ball"]').click(); // tries it out first
  await expect(page.locator('#pomCloset')).toHaveClass(/play-ball/);
  await expect(page.locator('#buyBtn')).toHaveText('Buy Bouncy Ball for 20 💎');
  await page.locator('#buyBtn').click();
  await expect(page.locator('#pomCloset .gem-badge')).toHaveText('💎 10');
  await expect(page.locator('.item[data-id="ball"] .price')).toHaveText('🎨 1 of 11');
  await expect(page.locator('.color-btn[data-id="ball"] .price')).toHaveText('Playing ✓');
  await page.locator('#closetBackBtn').click();

  // Toys sit on the House shelf and are never worn
  await expect(page.locator('#toyShelf .toy-btn')).toHaveCount(1);
  await page.locator('#toyShelf .toy-btn').click();
  await expect(page.locator('#pomHouse')).toHaveClass(/play-ball/);
  await expect(page.locator('#pomHouse .toy-fx')).toHaveCount(1);
  await expect(page.locator('#houseBubble')).toContainText('Fetch');
  await page.reload();
  const saved = await page.evaluate(() => ({ gems: state.gems, owned: state.owned, worn: state.worn, cents: state.totalCents }));
  expect(saved).toEqual({ gems: 10, owned: ['ball'], worn: { hat: 'cap', fur: 'classic' }, cents: 90 });

  // spin, flip, dance, then the ball
  const say = await page.evaluate(() => doTrick(6).say(6));
  expect(say).toContain('Fetch');
  await expect(page.locator('#pomGame')).toHaveClass(/play-ball/);
  expect(await page.evaluate(() => doTrick(7).cls)).toBe('trick-spin');
});

test('the picture toys play from the shelf in every color, and stay still with Reduce Motion', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ids = ['dino', 'rocket', 'truck', 'chest'];
  await page.evaluate(ids => {
    state.toys = Object.fromEntries(ids.map(id => [id, id]));
    state.owned = [...ids];
    saveState();
  }, ids);
  await page.reload();
  await page.locator('#houseBtn').click();
  await expect(page.locator('#toyShelf .toy-btn .toy-pic')).toHaveCount(4);
  for (const id of ids) {
    await page.locator(`#toyShelf .toy-btn[data-id="${id}"]`).click();
    await expect(page.locator('#pomHouse')).toHaveClass(new RegExp('play-' + id));
    await expect(page.locator('#pomHouse .toy-fx .toy-pic svg')).toHaveCount(1);
    expect(await page.evaluate(() => $('pomHouse').toyTl.duration())).toBeGreaterThan(1);
  }
  // Every color draws
  const drawn = await page.evaluate(ids => ids.flatMap(id => ITEMS[id].colors.map(look => toyFace(look, 'x').includes('<svg'))), ids);
  expect(drawn).toHaveLength(42); // the dino has no green and the truck no red, which look like their classic ones
  expect(drawn.every(Boolean)).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#toyShelf .toy-btn[data-id="rocket"]').click();
  const moved = await page.evaluate(() => {
    const tl = $('pomHouse').toyTl;
    tl.pause().seek(0.6);
    const fx = $('pomHouse').querySelector('.toy-fx');
    return [fx.className, Math.round(gsap.getProperty(fx, 'y')) || 0, gsap.getProperty(fx, 'scaleY')];
  });
  expect(moved).toEqual(['toy-fx rocket', 0, 1]); // still on the floor at what would be the top of its flight
  expect(errors).toEqual([]);
});

test('the Service Dog Vest comes off to play and goes back on to teach', async ({ page }) => {
  const vest = id => page.evaluate(id => $(id).querySelector('.acc-body').innerHTML !== '', id);
  const opacity = id => page.evaluate(id => Number(getComputedStyle($(id).querySelector('.acc-body')).opacity), id);
  await page.evaluate(() => { state.gems = 500; state.rooms.push('bedroom'); state.toys.ball = 'ball'; state.owned.push('ball'); saveState(); });
  await page.reload();
  await page.locator('#houseBtn').click();
  await page.locator('#closetBtn').click();
  await page.locator('.closet-tab[data-slot="body"]').click();
  await page.locator('.closet-items .item').filter({ hasText: 'Service' }).click();
  await page.locator('#colorRow .color-btn').first().click();
  await page.locator('#buyBtn').click();
  await expect(page.locator('#closetBubble')).toContainText("When my vest is on, I'm working");
  // Off while she plays with a toy, then back on
  await page.evaluate(() => playToy($('pomCloset'), 'ball'));
  await expect.poll(() => opacity('pomCloset')).toBe(0);
  await expect.poll(() => opacity('pomCloset'), { timeout: 4000 }).toBe(1);
  // Off at home and in the start screen's room peek, on to teach
  await page.locator('#closetBackBtn').click();
  await expect(page.locator('#houseBubble')).toContainText('Vest off. Play time!');
  await expect.poll(() => vest('pomHouse')).toBe(false);
  await page.locator('#houseBackBtn').click();
  expect(await vest('pomStart')).toBe(true);
  expect(await vest('pomPeek')).toBe(false);
  await expect.poll(() => opacity('pomStart')).toBe(1);
  expect(await page.evaluate(() => state.worn.body)).toBe('helpervest');
  // Each line is said only once
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseBubble')).not.toContainText('Vest off');
  // Other suits stay on at home
  await page.evaluate(() => { state.owned.push('dinosuit'); state.worn.body = 'dinosuit'; dressAllPoms(); });
  expect(await vest('pomHouse')).toBe(true);
});

test('the Bedroom needs 20 stickers, but the Closet works before that', async ({ page }) => {
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseRoom')).toHaveClass(/locked/);
  await expect(page.locator('#houseBubble')).toHaveText('20 more ⭐ to open my Bedroom!');
  await expect(page.locator('#furnItems')).toBeHidden();
  await page.locator('#closetBtn').click();
  await expect(page.locator('#closetScreen')).toHaveClass(/active/);
  expect(await page.evaluate(() => ROOMS.map(r => r.need))).toEqual([20, 40, 60, 95, 121, 145, 171, 190, 205, 221]);
});

test('a play report sends only the cookie, with a random device id, once when the first question is asked', async ({ page }) => {
  const reports = [];
  await page.route('https://report.test/**', route => { reports.push(route.request().postData()); route.fulfill({ status: 204 }); });
  await page.route('**/multiplication-ms-menna.html', async route => {
    const html = await (await route.fetch()).text();
    route.fulfill({ contentType: 'text/html', body: html.replace(/const REPORT_URL = .*;/, "const REPORT_URL = 'https://report.test/play';") });
  });
  await page.goto('/multiplication-ms-menna.html');
  await page.waitForTimeout(300);
  expect(reports).toEqual([]); // nothing on opening
  await page.locator('#picker .pick-btn', { hasText: /^7$/ }).click();
  await page.locator('#startBtn').click();
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
  await expect.poll(() => reports.length).toBe(1);
  const cookie = await page.evaluate(() => document.cookie.match(/(?:^|; )mennaMult=([^;]*)/)[1]);
  expect(reports[0]).toBe(cookie);
  expect(await page.evaluate(() => readCookie().did)).toMatch(/^[0-9a-f]{32}$/);
  // Later questions and saves send nothing more
  await page.evaluate(() => { game.index++; nextQuestion(); saveState(); });
  await page.waitForTimeout(300);
  expect(reports.length).toBe(1);
});

test('the device id comes back after an older version saves without it, and an old save gets one', async ({ page }) => {
  const id = await page.evaluate(() => { saveState(); return state.did; });
  expect(id).toMatch(/^[0-9a-f]{32}$/);
  // An older version drops `did` when it saves
  const back = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem(STORE_KEY));
    delete save.did;
    save.savedAt = Date.now() + 1000;
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
    document.cookie = 'mennaMult=; max-age=0; path=/';
    return loadState().did;
  });
  expect(back).toBe(id);
  // A save from before play reports, with nothing kept, gets a new id
  const fresh = await page.evaluate(() => { localStorage.clear(); document.cookie = 'mennaMult=; max-age=0; path=/'; return loadState({ v: 27, savedAt: 1 }).did; });
  expect(fresh).toMatch(/^[0-9a-f]{32}$/);
  expect(fresh).not.toBe(id);
});

test('played over plain http, as on this computer, nothing is sent', async ({ page }) => {
  const requests = [];
  page.on('request', r => { if (r.method() === 'POST') requests.push(r.url()); });
  await page.locator('#picker .pick-btn', { hasText: /^7$/ }).click();
  await page.locator('#startBtn').click();
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
  await page.waitForTimeout(300);
  expect(requests).toEqual([]);
});

test('the viola is new at the end of the furniture, and she plays the guitar and viola in her paws', async ({ page }) => {
  // Furniture is stored by index, so the viola goes last and the Guitar Stand keeps its id and place.
  expect(await page.evaluate(() => [FURNITURE.at(-1).id, FURNITURE.findIndex(f => f.id === 'guitar') < FURNITURE.findIndex(f => f.id === 'telescope')])).toEqual(['viola', true]);
  await page.evaluate(() => {
    state.mastery.fill(STICKER_AT);
    state.furniture.push('guitar', 'viola.p');
    state.home.guitar = 'guitar'; state.home.viola = 'viola.p';
    state.room = 'music'; showHouse(); stopWalker(houseWalker);
    doAct(houseWalker, FURN.viola, null, false);
  });
  await expect(page.locator('#houseRoom .pom-container')).toHaveClass(/act-viola/);
  // The viola leaves its stand for her paws, and the bow goes in her mouth
  await expect(page.locator('#houseRoom .pom-container .held')).toHaveCount(2);
  await expect(page.locator('#houseRoom .spot[data-id="viola"]')).toHaveClass(/playing/);
  await page.evaluate(() => { stopWalker(houseWalker); doAct(houseWalker, FURN.guitar, null, false); });
  await expect(page.locator('#houseRoom .pom-container .held')).toHaveCount(1);
  await expect(page.locator('#houseRoom .spot.playing')).toHaveAttribute('data-id', 'guitar');
  await page.evaluate(() => stopWalker(houseWalker));
  await expect(page.locator('#houseRoom .pom-container .held')).toHaveCount(0);
  await expect(page.locator('#houseRoom .spot.playing')).toHaveCount(0);
});

test('the five new rooms each have at least five pieces, and the surfboard rides a wave at the Beach', async ({ page }) => {
  const counts = await page.evaluate(() => ['spa', 'music', 'swimpool', 'beach', 'treehouse'].map(id => FURNITURE.filter(f => f.room === id).length));
  for (const n of counts) expect(n).toBeGreaterThanOrEqual(5);
  // The surfboard is Beach furniture with colors, not a toy
  const board = await page.evaluate(() => ({ room: FURN.surfboard.room, colors: FURN.surfboard.colors.length }));
  expect(board.room).toBe('beach');
  expect(board.colors).toBeGreaterThan(1);

  await page.evaluate(() => {
    for (let i = 0; i < 205; i++) state.mastery[i] = STICKER_AT;
    showHouse();
  });
  await expect(page.locator('.room-tab')).toHaveCount(10);
  // The Beach is the last room, opened by the final sticker
  await expect(page.locator('.room-tab[data-room="treehouse"]')).not.toHaveClass(/locked/);
  await expect(page.locator('.room-tab[data-room="beach"]')).toHaveClass(/locked/);
  await page.evaluate(() => { state.mastery.fill(STICKER_AT); state.gems = 100; state.room = 'beach'; saveState(); showHouse(); });
  await expect(page.locator('.room-tab[data-room="beach"]')).not.toHaveClass(/locked/);
  await expect(page.locator('#houseRoom .deco-sea')).toHaveCount(1);
  // Ms. Menna surfs on a board she owns
  await page.evaluate(() => { state.furniture.push('surfboard'); state.home[FURN.surfboard.base] = 'surfboard'; renderHouse(); doAct(houseWalker, FURN.surfboard, null, true); });
  await expect(page.locator('#houseRoom .pom-container')).toHaveClass(/act-surf/);
  await expect(page.locator('#houseRoom .wave-fx')).toHaveCount(1);
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
  await page.evaluate(() => { state.rooms = []; state.mastery.fill(0); for (let i = 0; i < 5; i++) state.mastery[i] = STICKER_AT; showHouse(); });
  expect(await page.evaluate(() => [roomOpen(ROOM.bedroom), roomOpen(ROOM.garden), roomOpen(ROOM.yard)])).toEqual([true, true, false]);
  await page.evaluate(() => { state.furniture = []; });
  expect(await page.evaluate(() => roomOpen(ROOM.bedroom))).toBe(false);
});

test('an open room opens every room before it, so a Spa kept from v45 brings the Kitchen', async ({ page }) => {
  // v45 opened the Spa at 40 stickers, before the Kitchen; now the Kitchen comes first at 40 and the Spa needs 60
  await page.evaluate(() => { state.rooms = ['spa']; state.mastery.fill(0); for (let i = 0; i < 30; i++) state.mastery[i] = STICKER_AT; showHouse(); });
  expect(await page.evaluate(() => ROOMS.filter(roomOpen).map(r => r.id))).toEqual(['bedroom', 'kitchen', 'spa']);
  await expect(page.locator('.room-tab[data-room="kitchen"]')).not.toHaveClass(/locked/);
  await expect(page.locator('.room-tab[data-room="music"]')).toHaveClass(/locked/);
  // A v24 save opened the Kitchen at 30 stickers; it no longer brings the Spa, which now comes after it
  await page.evaluate(() => { state.rooms = ['kitchen']; showHouse(); });
  expect(await page.evaluate(() => ROOMS.filter(roomOpen).map(r => r.id))).toEqual(['bedroom', 'kitchen']);
  // Garden furniture from a v15 save opens the rooms now placed before the Garden
  await page.evaluate(() => { state.rooms = []; state.furniture = [FURNITURE.find(f => f.room === 'garden' && f.price > 0).id]; });
  expect(await page.evaluate(() => ROOMS.filter(roomOpen).map(r => r.id))).toEqual(['bedroom', 'kitchen', 'spa', 'music', 'playroom', 'garden']);
});

test('an open room stays open, and a v24 save keeps rooms opened at the old counts', async ({ page }) => {
  // 20 stickers open the Bedroom; it stays open after losing them
  await page.evaluate(() => { for (let i = 0; i < 20; i++) state.mastery[i] = STICKER_AT; saveState(); state.mastery.fill(0); saveState(); });
  await page.reload();
  expect(await page.evaluate(() => [roomOpen(ROOM.bedroom), state.rooms])).toEqual([true, ['bedroom']]);

  // A v24 save with 35 shared stickers opened the Kitchen at 30. After the split it has 70 stickers, but the Playroom stays shut.
  await page.evaluate(() => {
    const m = Array(SHARED_FACT_COUNT).fill(0);
    const pairs = OLD_TIMES_KEYS.filter(k => flipKey(k) !== k).slice(0, 35);
    for (const k of pairs) m[FACT_INDEX[k]] = STICKER_AT;
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 24, mastery: m.join(''), savedAt: Date.now() + 5000 }));
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
  });
  await page.reload();
  expect(await page.evaluate(() => [stickerCount(), ROOMS.filter(roomOpen).map(r => r.id)])).toEqual([70, ['bedroom', 'kitchen', 'spa']]);
  // Losing the copied stickers does not close the Kitchen or the Spa
  await page.evaluate(() => { state.mastery.fill(0); });
  expect(await page.evaluate(() => ROOMS.filter(roomOpen).map(r => r.id))).toEqual(['bedroom', 'kitchen', 'spa']);
});

test("Ms. Menna's House opens rooms with stickers and buys furniture colors with gems", async ({ page }) => {
  await page.evaluate(() => { state.gems = 30; state.totalCents = 120; for (let i = 0; i < 60; i++) state.mastery[i] = STICKER_AT; saveState(); });
  await page.reload();
  await page.locator('#houseBtn').click();
  await expect(page.locator('#houseScreen')).toHaveClass(/active/);

  // 60 stickers open the Kitchen but not the Playroom
  await expect(page.locator('.room-tab[data-room="kitchen"]')).not.toHaveClass(/locked/);
  await expect(page.locator('.room-tab[data-room="playroom"]')).toHaveClass(/locked/);
  await page.locator('.room-tab[data-room="playroom"]').click();
  await expect(page.locator('#houseBubble')).toHaveText('61 more ⭐ to open it!');

  // The closet is free; an empty spot shows its colors, and a color is shown in place before buying
  await expect(page.locator('#houseRoom .spot[data-id="wardrobe"]')).not.toHaveClass(/empty/);
  await expect(page.locator('#houseRoom .spot[data-id="bed"]')).toHaveClass(/empty/);
  await page.locator('#furnItems .item[data-id="bed"]').click();
  await expect(page.locator('#furnColors .color-btn')).toHaveCount(11);
  await page.locator('#furnColors .color-btn[data-id="bed"]').click();
  await expect(page.locator('#houseRoom .spot[data-id="bed"]')).toHaveClass(/trying/);
  await page.locator('#furnBuyBtn').click();
  await expect(page.locator('.house-head .gem-badge')).toHaveText('💎 15');

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

// v23: Learn with Ms. Menna (0 to 10), a number picker for practice, and a switch for division.
const giveStickers = (page, keys) => page.evaluate(list => {
  for (const k of list) state.mastery[FACT_INDEX[k]] = STICKER_AT;
  saveState();
  renderPath();
}, keys);
// The facts of the ×n table from n × from to n × to, and their flips, as sticker keys.
const tableKeys = (n, from, to) => [...new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap(k => [`${n}x${k}`, `${k}x${n}`]))];
const divideOn = page => page.evaluate(() => { state.divOn = state.divIntro = true; saveState(); renderPath(); });

// Plays rounds without answering and lists every question asked.
const playRounds = (page, path, rounds, max = 0) => page.evaluate(([path, rounds, max]) => {
  const out = [];
  for (let r = 0; r < rounds; r++) {
    startRound(path, max);
    const round = [];
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      round.push({ a: game.a, b: game.b, div: game.div, key: keyOf(game), sticker: hasSticker(keyOf(game)), peek: game.peekNow });
      if (i < QUESTIONS_PER_ROUND - 1) { game.index++; nextQuestion(); }
    }
    out.push(round);
  }
  goHome();
  return out;
}, [path, rounds, max]);

test('the home screen has the path, a number picker, and division off', async ({ page }) => {
  await expect(page.locator('#pathNow')).toHaveText('Learning ×2 · 0 of 21 stickers'); // 2 × 0 to 2 × 10 and their flips
  await expect(page.locator('#picker .pick-btn')).toHaveCount(18); // 3 to 20
  await expect(page.locator('#startBtn')).toBeDisabled();
  await expect(page.locator('#divideToggle')).not.toBeChecked();

  // ×2 first, with no division while the switch is off. Sneak peeks ask later tables, without 0 facts
  const main = (await playRounds(page, 'main', 20)).flat();
  expect(main.filter(q => !q.peek && q.a !== 2 && q.b !== 2)).toEqual([]);
  const peeks = main.filter(q => q.peek);
  expect(peeks.length).toBeGreaterThan(0);
  expect(peeks.filter(q => q.a === 0 || q.b === 0 || q.a === 2 || q.b === 2)).toEqual([]);
  expect(main.filter(q => q.div)).toEqual([]);

  // Practice asks any fact with both numbers up to her number, and remembers it
  await page.locator('#picker .pick-btn', { hasText: /^7$/ }).click();
  await expect(page.locator('#pickSub')).toHaveText('Questions will use numbers 0 to 7');
  await page.locator('#startBtn').click();
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
  const practice = (await playRounds(page, 'practice', 20, 7)).flat();
  expect(practice.filter(q => q.a > 7 || q.b > 7 || q.div)).toEqual([]);
  expect(Math.max(...practice.map(q => Math.max(q.a, q.b)))).toBe(7);
  await page.reload();
  await expect(page.locator('#picker .pick-btn.selected')).toHaveText('7');
});

test('picker medals follow the stickers up to each number', async ({ page }) => {
  const upTo3 = [];
  for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) upTo3.push(`${a}x${b}`);
  await giveStickers(page, upTo3);
  await page.reload();
  await expect(page.locator('#picker .pick-btn[data-n="3"] .medal')).toHaveText('🥇');
  await expect(page.locator('#picker .pick-btn[data-n="4"] .medal')).toHaveText('🥉'); // 16 of 25
  await giveStickers(page, ['0x4', '4x0']);
  await page.reload();
  await expect(page.locator('#picker .pick-btn[data-n="4"] .medal')).toHaveText('🥈'); // 18 of 25
  await expect(page.locator('#picker .pick-btn[data-n="20"] .medal')).toHaveCount(0);
});

test('a path moves on at 80%, rounds are mostly known facts, and division joins when switched on', async ({ page }) => {
  await giveStickers(page, tableKeys(2, 2, 10)); // 17 of the 21 ×2 facts
  await expect(page.locator('#pathNow')).toHaveText('Learning ×10 · 0 of 19 stickers'); // 2 × 10 and 10 × 2 were in ×2
  const off = (await playRounds(page, 'main', 10)).flat();
  expect(off.filter(q => q.div)).toEqual([]);

  await divideOn(page);
  const rounds = await playRounds(page, 'main', 40);
  for (const round of rounds) {
    expect(round.filter(q => q.peek).length).toBeLessThanOrEqual(1);
    for (const q of round.filter(q => !q.peek)) {
      expect([2, 10].includes(q.a) || [2, 10].includes(q.b)).toBe(true);
      if (q.div) expect(q.a * q.b % q.a).toBe(0);
    }
  }
  const learning = rounds.map(round => round.filter(q => !q.div && !q.sticker && !q.peek).length);
  expect(Math.max(...learning)).toBeLessThanOrEqual(4); // 3 new facts, or 4 after strong rounds
  expect(Math.min(...learning)).toBeGreaterThanOrEqual(3);
  const divides = rounds.map(round => round.filter(q => q.div).length);
  expect(Math.min(...divides)).toBeGreaterThanOrEqual(2); // about 3 in 10
  expect(Math.max(...divides)).toBeLessThanOrEqual(3);

  // Practice divides too, with numbers up to her pick
  const practice = (await playRounds(page, 'practice', 10, 5)).flat();
  expect(practice.filter(q => q.div).length).toBeGreaterThan(15);
  expect(practice.filter(q => q.a > 5 || q.b > 5)).toEqual([]);
});

test('finishing a table on the path says what comes next', async ({ page }) => {
  await giveStickers(page, [...tableKeys(2, 2, 9), '2x1']); // 16 of 21, just under 80%
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    state.mastery[FACT_INDEX[factKey(2, 10)]] = STICKER_AT;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  });
  await expect(page.locator('#summaryScreen')).toHaveClass(/active/);
  await expect(page.locator('#pathUp')).toHaveText('🐾 You learned ×2! Next up: ×10');
  await page.locator('.trick-choice').first().click();
  await expect(page.locator('#homeBtn')).toHaveText('← Home');
  await page.locator('#againBtn').click();
  expect(await page.evaluate(() => [game.path, game.step])).toEqual(['main', 1]);
});

test('finishing a table lets the child pick a trick to teach Ms. Menna, used in streaks, and a tap at home is just a hello', async ({ page }) => {
  // A fresh save knows only the first three tricks
  expect(await page.evaluate(() => knownTricks().map(t => t.cls))).toEqual(['trick-spin', 'trick-flip', 'trick-dance']);
  await giveStickers(page, [...tableKeys(2, 2, 9), '2x1']);
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    state.mastery[FACT_INDEX[factKey(2, 10)]] = STICKER_AT;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  });
  // The next 3 tricks, and no way out until she picks one
  await expect(page.locator('#summaryBubble')).toHaveText('You finished a table! Which trick should I learn? 🐾');
  await expect(page.locator('.trick-choice')).toHaveText(['🌸Sit pretty', '👋Wave hello', '✋Give a high five']);
  await expect(page.locator('#againBtn')).toBeHidden();
  await expect(page.locator('#homeBtn')).toBeHidden();
  await expect(page.locator('#newTrickText')).toBeHidden();
  // It covers the page, all but the mute button
  expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, 5).closest('#teachTrick') !== null)).toBe(true);
  await page.locator('#muteBtn').click();
  expect(await page.evaluate(() => state.muted)).toBe(true);
  await page.locator('#muteBtn').click();
  await page.locator('.trick-choice', { hasText: 'Wave hello' }).click();
  await expect(page.locator('#pomSummary')).toHaveClass(/trick-wave/);
  await expect(page.locator('#teachTrick')).toBeHidden();
  await expect(page.locator('#againBtn')).toBeVisible();
  await expect(page.locator('#homeBtn')).toBeVisible();
  await expect(page.locator('#newTrickText')).toHaveText('🎉 Ms. Menna learned to wave hello! Tap her to see it again.');
  await expect(page.locator('#summaryBubble')).toHaveText('I learned to wave hello! Thank you! 🎉');
  expect(await page.evaluate(() => [state.tricks, JSON.parse(localStorage.getItem(STORE_KEY)).tricks])).toEqual(['1', '1']);
  await expect(page.locator('#pomSummary')).not.toHaveClass(/trick-wave/);
  await page.locator('#pomSummary').click();
  await expect(page.locator('#pomSummary')).toHaveClass(/trick-wave/);

  // Streaks: spin, flip, dance, then the trick she was taught
  expect(await page.evaluate(() => [6, 7].map(n => doTrick(n).cls))).toEqual(['trick-wave', 'trick-spin']);

  // Tapping her at home gets a bounce and a different hello each time, never a trick
  await page.locator('#homeBtn').click();
  let last = '';
  for (let i = 0; i < 4; i++) {
    await page.locator('#pomStart').click();
    await expect(page.locator('#pomStart')).toHaveClass(/bounce/);
    await expect(page.locator('#pomStart')).not.toHaveClass(/trick-/);
    const said = await page.locator('#startBubble').textContent();
    expect(said).not.toBe(last);
    last = said;
    await page.waitForTimeout(700);
  }

  // The next round finishes no table, so no new trick, but she still celebrates: a bounce for 0 right
  await page.locator('#pathBtn').click();
  await page.evaluate(() => { game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  await expect(page.locator('#newTrickText')).toBeHidden();
  await expect(page.locator('#pomSummary')).toBeVisible();
  // The bounce starts 0.9 s in and lasts 0.65 s, so check often enough not to miss it
  await expect.poll(() => page.evaluate(() => $('pomSummary').classList.contains('bounce')), { intervals: [50] }).toBe(true);
  // Tapping her then gets a bounce, not a trick
  await page.waitForTimeout(700);
  await page.locator('#pomSummary').click();
  await expect(page.locator('#pomSummary')).toHaveClass(/bounce/);
  await expect(page.locator('#pomSummary')).not.toHaveClass(/trick-/);
});

test('finishing a division table teaches her a division trick, simple ones first and a double backflip last', async ({ page }) => {
  // Every times table is done, and ÷2 has 15 of its 19 stickers, just under 80%
  const left = ['d2x7', 'd7x2', 'd2x3', 'd3x2'];
  await page.evaluate(left => {
    state.divOn = true;
    for (const k of [...PATH_FACTS.flat(), ...DIVIDE_FACTS[0].filter(k => !left.includes(k))]) state.mastery[FACT_INDEX[k]] = STICKER_AT;
    saveState();
    renderPath();
  }, left);
  // Starting a round catches up the times tables done without picking: the planned tricks, in order
  await page.locator('#pathBtn').click();
  expect(await page.evaluate(() => knownTricks().length)).toBe(13);
  await page.evaluate(left => {
    for (const k of left) state.mastery[FACT_INDEX[k]] = STICKER_AT;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  }, left);
  await expect(page.locator('.trick-choice')).toHaveText(['🦶Hop on one leg', '💫Twirl', '🌺Do a hula dance']);
  await page.locator('.trick-choice').first().click();
  await expect(page.locator('#newTrickText')).toHaveText('🎉 Ms. Menna learned to hop on one leg! Tap her to see it again.');
  await expect(page.locator('#pomSummary')).toHaveClass(/trick-hop/);
  expect(await page.evaluate(() => knownTricks().at(-1).cls)).toBe('trick-hop');
  // With every table done she knows all 23, ending with the double backflip
  const all = await page.evaluate(() => { state.mastery.fill(STICKER_AT); catchUpTricks(); return knownTricks().map(t => t.cls); });
  expect(all.length).toBe(23);
  expect(all.at(-1)).toBe('trick-doubleflip');
  // A trick with a prop shows it, then takes it away
  await page.evaluate(() => showTrick($('pomSummary'), DIVIDE_TRICKS.find(t => t.cls === 'trick-juggle')));
  await expect(page.locator('#pomSummary .fx-juggle')).toHaveCount(3);
  await expect(page.locator('#pomSummary .fx-juggle')).toHaveCount(0);
});

test('the last two times tables offer 2 tricks and then just the last one, and a table done without a pick gets the planned trick', async ({ page }) => {
  // 8 tables done but only 7 tricks taught, roll over missing: the round start teaches it
  await page.evaluate(() => {
    for (const k of PATH_NEW.slice(0, 8).flat()) state.mastery[FACT_INDEX[k]] = STICKER_AT;
    state.tricks = '0123457';
    saveState();
  });
  await page.locator('#pathBtn').click();
  expect(await page.evaluate(() => state.tricks)).toBe('01234576');
  const finish = s => page.evaluate(s => {
    for (const k of PATH_NEW[s]) state.mastery[FACT_INDEX[k]] = STICKER_AT;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  }, s);
  await finish(8);
  await expect(page.locator('.trick-choice')).toHaveText(['🌀Chase her tail', '🦘Do a big jump']);
  await page.locator('.trick-choice', { hasText: 'Do a big jump' }).click();
  await expect(page.locator('#pomSummary')).toHaveClass(/trick-jump/);
  await page.locator('#againBtn').click();
  // The last table has one trick left, so she just learns it
  await finish(9);
  await expect(page.locator('#teachTrick')).toBeHidden();
  await expect(page.locator('#newTrickText')).toHaveText('🎉 Ms. Menna learned to chase her tail! Tap her to see it again.');
  await expect(page.locator('#divideInvite')).toBeVisible();
  await expect(page.locator('#againBtn')).toBeVisible();
  expect(await page.evaluate(() => state.tricks)).toBe('0123457698');
});

test('Ms. Menna reacts to learning moments with their own trick, and dances for a 3-star round', async ({ page }) => {
  await page.locator('#pathBtn').click();
  // A third dot: new sticker, backflip
  await page.evaluate(() => { state.mastery[FACT_INDEX['3x4']] = 2; state.days[FACT_INDEX['3x4']] = today() - 1; });
  await askFact(page, 3, 4);
  await answer(page, true);
  await expect(page.locator('#pomGame')).toHaveClass(/trick-flip/);
  await page.waitForTimeout(1900);
  // Waking a sleepy sticker: a spin until she learns to wave with ×10, then a wave
  expect(await page.evaluate(() => [reactionTrick('woke').cls, (state.mastery.fill(STICKER_AT), catchUpTricks(), reactionTrick('woke').cls)]))
    .toEqual(['trick-spin', 'trick-wave']);
  await page.evaluate(() => { state.mastery.fill(0); state.mastery[FACT_INDEX['3x4']] = STICKER_AT; });
  // A fact missed earlier in the round, then right: happy dance
  await askFact(page, 6, 7);
  await answer(page, false);
  await page.waitForTimeout(800);
  await answer(page, true);
  await page.waitForTimeout(1900);
  await askFact(page, 6, 7);
  await answer(page, true);
  await expect(page.locator('#pomGame')).toHaveClass(/trick-dance/);
  // A plain answer sometimes gets a surprise trick
  await page.waitForTimeout(1900);
  await page.evaluate(() => { Math.random = () => 0.1; });
  await answer(page, true);
  await expect(page.locator('#pomGame')).toHaveClass(/trick-/);
  await page.waitForTimeout(1900);
  // A 3-star round ends with a happy dance on the summary
  await page.evaluate(() => { game.firstTry = 9; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  await expect(page.locator('#pomSummary')).toHaveClass(/trick-dance/);
});

test('the summary shows learning first, and fixed facts are celebrated', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await askFact(page, 3, 4);
  await answer(page, false);
  await page.waitForTimeout(800);
  await answer(page, true); // right on a second try of the same question: not fixed yet
  await expect(page.locator('#gameBubble')).not.toContainText('fixed');
  await page.waitForTimeout(1900);
  await askFact(page, 3, 4);
  await answer(page, true);
  await expect(page.locator('#gameBubble')).toHaveText('You fixed 3 × 4! 🌟');
  await page.evaluate(() => { game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  await expect(page.locator('#newStickers')).toContainText('You fixed: 3 × 4');
  // Learning lines come before the score and coins
  expect(await page.evaluate(() => !!($('newStickers').compareDocumentPosition(document.querySelector('#summaryScreen .stat-row')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
});

test('on an iPad, the Home Screen tip waits for an open without the sleepy hello, so it never cuts it off', async ({ page, context }) => {
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' }));
  await setFact(page, '3x5', 3, 1);
  await page.reload();
  await expect(page.locator('#startBubble')).toContainText('1 sticker is sleepy');
  await page.reload();
  await expect(page.locator('#startBubble')).toContainText('Add to Home Screen');
});

test('Ms. Menna says sleepy stickers are still hers, once a day', async ({ page }) => {
  await setFact(page, '3x5', 3, 1);
  await setFact(page, '3x6', 3, 1);
  await page.reload();
  await expect(page.locator('#startBubble')).toHaveText("2 stickers are sleepy 💤. They're still yours! Get them right to wake them up! 🐾");
  await page.reload();
  await expect(page.locator('#startBubble')).not.toContainText('sleepy');
  await page.locator('#stickersBtn').click();
  await expect(page.locator('#stickerHelp')).toContainText('Sleepy stickers are still yours.');
});

test('division pays like its times fact, hints with the missing number, and shows the fact family', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const askDivide = (a, b) => page.evaluate(([x, y]) => {
    Object.assign(game, { a: x, b: y, div: true });
    $('factorA').textContent = x * y; $('opSign').textContent = '÷'; $('factorB').textContent = x;
  }, [a, b]);

  // 56 ÷ 8 = 7 pays what 8 × 7 pays, and earns a dot on its own sticker
  await askDivide(8, 7);
  await expect(page.locator('#equation')).toHaveText(/56\s*÷\s*8/);
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('5 coins');
  await expect(page.locator('#feedback')).toContainText('56 ÷ 8 = 7 ✓');
  await expect(page.locator('#feedback .family')).toHaveText('8 × 7 = 56 · 7 × 8 = 56 · 56 ÷ 7 = 8');
  expect(await page.evaluate(() => [state.mastery[FACT_INDEX['d8x7']], state.mastery[FACT_INDEX['d7x8']]])).toEqual([1, 0]);

  // The picture turns 56 ÷ 7 into 7 × ? = 56, and pays 1 coin after it
  await page.waitForTimeout(2200);
  await askDivide(7, 8);
  await answer(page, false);
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['d7x8']])).toBe(0);
  await page.locator('#hintBtn').click({ force: true });
  await expect(page.locator('#gameBubble')).toHaveText('7 × ? = 56. How many in each row?');
  await expect(page.locator('#gridCaption')).toHaveText('56 dots in 7 rows. How many in each row?');
  await expect(page.locator('#arrayGrid .cell')).toHaveCount(56);
  await answer(page, true);
  await expect(page.locator('#gameBankAmount')).toHaveText('6 coins');
  await expect(page.locator('#feedback .family')).toHaveText('7 × 8 = 56 · 8 × 7 = 56 · 56 ÷ 8 = 7');

  // Division is never by 0, and a square has a one-line family
  expect(await page.evaluate(() => [FACT_INDEX['d0x5'], FACT_INDEX['d5x0'], DIVIDE_KEYS.length])).toEqual([undefined, undefined, 400]);
  await page.waitForTimeout(2200);
  await askDivide(6, 6);
  await answer(page, true);
  await expect(page.locator('#feedback .family')).toHaveText('6 × 6 = 36');
});

test('division stickers count towards opening rooms', async ({ page }) => {
  await giveStickers(page, await page.evaluate(() => DIVIDE_KEYS.slice(0, 20)));
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

test('every fact up to 20 has a picture that adds up, 20 × 20 too', async ({ page }) => {
  const out = await page.evaluate(() => {
    const bad = [];
    for (const key of FACT_KEYS) {
      const [a, b] = factsOf(key);
      const div = key.startsWith('d');
      try {
        const { rows, cols, p, q } = hintPlan({ a, b, div });
        const right = div ? rows === a && cols === b : rows * cols === a * b && (!p || (q < 0 ? p - 1 : p + q) === rows);
        if (!right) bad.push(key);
      } catch { bad.push(key + ' throws'); }
    }
    const { rows, cols, p, q, tip } = hintPlan({ a: 20, b: 20 });
    return { bad, plan: [rows, cols, p, q], tip };
  });
  expect(out.bad).toEqual([]);
  expect(out.plan).toEqual([20, 20, 10, 10]);
  expect(out.tip).toBe('20 is 10 and 10. Find 10 × 20, then do it again!');
});

test('on the smallest phone, the widest pictures fit with their row totals', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('.pick-btn[data-n="20"]').click();
  await page.locator('#startBtn').click();
  const wide = await page.evaluate(() => [[1, 20], [3, 20], [20, 20], [16, 16], [2, 19]].filter(([a, b]) => {
    Object.assign(game, { a, b, div: false });
    showGrid(false, true);
    const grid = $('arrayGrid');
    return grid.scrollWidth > grid.clientWidth || grid.offsetWidth > $('gridArea').clientWidth;
  }));
  expect(wide).toEqual([]);
});

// v19: stickers are learned on 2 days, then come back sleepy for review visits.
const setFact = (page, key, mastery, daysAgo, level = 0) => page.evaluate(([k, m, ago, lv]) => {
  const i = FACT_INDEX[k];
  state.mastery[i] = m;
  state.days[i] = today() - ago;
  state.levels[i] = lv;
  saveState();
}, [key, mastery, daysAgo, level]);


test('a fact earns one dot a day', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await setFact(page, '6x8', 1, 0); // its first dot was today
  await askFact(page, 6, 8);
  await answer(page, true);
  await expect(page.locator('#gameBubble')).toContainText('One dot a day!');
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['6x8']])).toBe(1);
  await page.waitForTimeout(1900);
  await setFact(page, '6x8', 1, 1); // its first dot was yesterday
  await askFact(page, 6, 8);
  await answer(page, true);
  expect(await page.evaluate(() => [state.mastery[FACT_INDEX['6x8']], state.days[FACT_INDEX['6x8']] === today()])).toEqual([2, true]);
});

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
  await expect(page.locator('#stickerGrid > .sleepy')).toHaveCount(1); // 3 × 5, while 5 × 3 has no sticker
  await expect(page.locator('#stickerCount')).toHaveText('3 of 121 stickers · 1 sleepy 💤');
  await page.locator('#stickerBackBtn').click();

  await page.locator('#pathBtn').click();
  await askFact(page, 3, 5);
  await answer(page, true);
  await expect(page.locator('.banner')).toContainText('3 × 5 woke up!');
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

test('sleepy facts come up more often', async ({ page }) => {
  const counts = await page.evaluate(() => {
    const set = (k, ago, level) => { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today() - ago; state.levels[i] = level; };
    set('2x3', 30, 4);
    set('2x4', 0, 0);
    game = { path: 'main', step: 9, index: 0, slots: ROUND_SLOTS, divideAt: [], asked: new Set(), prevKey: null };
    const n = { '2x3': 0, '2x4': 0 };
    for (let i = 0; i < 6000; i++) { const q = pickQuestion(); const k = factKey(q.a, q.b); if (k in n) n[k]++; }
    return n;
  });
  expect(counts['2x3']).toBeGreaterThan(counts['2x4'] * 2); // sleepy vs. awake
});

test('on the ×0 & ×1 step, 0 facts come up as often as ×1 facts', async ({ page }) => {
  const share = await page.evaluate(() => {
    // ×2, ×10 and ×5 are done, so the path is on ×0 & ×1: 15 new 0 facts and 13 new ×1 facts
    for (const k of PATH_FACTS.slice(0, 3).flat()) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    startRound('main');
    game.index = game.slots.indexOf('N');
    let zeros = 0;
    const picks = 3000;
    for (let n = 0; n < picks; n++) if (hasZero(keyOf(pickQuestion()))) zeros++;
    goHome();
    return zeros / picks;
  });
  expect(share).toBeGreaterThan(0.47); // about 15 of 28; it was about 37% while 0 facts were held back
});

test('a table counts only the facts it adds, so ×9 and ×7 are taught and ×0 & ×1 needs its 0 facts', async ({ page }) => {
  const give = keys => page.evaluate(ks => {
    for (const k of ks) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    saveState(); renderPath();
  }, keys);
  await give(await page.evaluate(() => PATH_FACTS.slice(0, 3).flat()));
  // ×0 & ×1 adds 15 0 facts and 13 ×1 facts. Every ×1 fact and 11 of the 0 facts is not enough.
  const [zeros, ones] = await page.evaluate(() => [PATH_NEW[3].filter(hasZero), PATH_NEW[3].filter(k => !hasZero(k))]);
  await give([...ones, ...zeros.slice(0, 11)]);
  await expect(page.locator('#pathNow')).toHaveText('Learning ×0 & ×1 · 24 of 28 stickers');
  await give(zeros.slice(11, 12));
  await expect(page.locator('#pathNow')).toHaveText(/^Learning ×4 /);

  // With the first 8 tables done, ×9 is still taught: it adds 9 × 7, 7 × 9 and 9 × 9
  await give(await page.evaluate(() => PATH_FACTS.slice(0, 8).flat()));
  await expect(page.locator('#pathNow')).toHaveText('Learning ×9 · 0 of 3 stickers');
  await page.locator('#pathBtn').click();
  await page.evaluate(() => { game.index = game.slots.indexOf('N'); });
  const fresh = await page.evaluate(() => Array.from({ length: 30 }, () => keyOf(pickQuestion())));
  expect(fresh.every(k => ['9x7', '7x9', '9x9'].includes(k))).toBe(true);
  // One round can finish ×9 and ×7 together, and the summary names both
  await page.evaluate(() => {
    for (const k of ['9x7', '7x9', '9x9', '7x7']) state.mastery[FACT_INDEX[k]] = STICKER_AT;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  });
  await expect(page.locator('#pathUp')).toHaveText("🐾 You learned ×9 and ×7! That's all the times tables! 🏆");
});

test('the last question is free for a retry', async ({ page }) => {
  const last = await page.evaluate(() => {
    for (const k of PATH_FACTS.flat()) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    startRound('main');
    Object.assign(game, { index: QUESTIONS_PER_ROUND - 1, prevKey: null });
    game.retries.push({ a: 8, b: 8, div: false, key: '8x8', at: QUESTIONS_PER_ROUND - 1 });
    nextQuestion();
    const last = keyOf(game);
    goHome();
    return last;
  });
  expect(last).toBe('8x8');
});

// How many questions of the round have the slot letter: N new, L leftover, M missed earlier today, P peek, R review.
const slotCount = (page, letter) => page.evaluate(l => [...game.slots].filter(s => s.toUpperCase() === l).length, letter);

test('after a hard round the path teaches 2 new facts and 1 leftover instead of 3 and 2', async ({ page }) => {
  await page.locator('#pathBtn').click();
  expect([await slotCount(page, 'N'), await slotCount(page, 'L')]).toEqual([3, 2]);
  await page.evaluate(() => { game.firstTry = 4; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  expect(await page.evaluate(() => state.easyPath)).toBe(true);
  await page.locator('#againBtn').click();
  expect([await slotCount(page, 'N'), await slotCount(page, 'L'), await slotCount(page, 'R')]).toEqual([2, 1, 4]);
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

test('4 new facts a round only after a strong round with most new facts right', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const end = (firstTry, tries) => page.evaluate(([f, t]) => {
    state.newTries = t;
    game.firstTry = f;
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
    return state.fastPath;
  }, [firstTry, tries]);
  expect(await end(10, '111111111')).toBe(false); // fewer than 10 new facts so far
  expect(await end(9, '1101111011')).toBe(true);
  await page.locator('#againBtn').click();
  expect([await slotCount(page, 'N'), await slotCount(page, 'M')]).toEqual([4, 1]);
  expect(await end(10, '1101101011')).toBe(false); // 7 of the last 10 new facts
  expect(await end(8, '1111111111')).toBe(false); // 8 of 10 in the round
  await page.locator('#againBtn').click();
  expect(await slotCount(page, 'N')).toBe(3);
  expect(await end(9, '1111111111')).toBe(true);
  // Practice changes neither the 4 new facts nor easier mode, even after a hard round
  await page.evaluate(() => { goHome(); startRound('practice', 5); game.firstTry = 2; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  expect(await page.evaluate(() => [state.fastPath, state.easyPath])).toEqual([true, false]);
  await page.reload();
  expect(await page.evaluate(() => [state.fastPath, state.newTries])).toEqual([true, '1111111111']);
  // A hard round turns easier mode on, which wins over 4 new facts
  await page.locator('#pathBtn').click();
  expect(await slotCount(page, 'N')).toBe(4);
  expect(await end(5, '1111111111')).toBe(false);
  await page.locator('#againBtn').click();
  expect(await slotCount(page, 'N')).toBe(2);
});

test('only the first answer to a new times fact counts toward 4 new facts', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const ask = (a, b) => page.evaluate(([x, y]) => {
    game.track = !hasSticker(factKey(x, y)) && !game.missed.some(m => keyOf(m) === factKey(x, y));
    Object.assign(game, { a: x, b: y, div: false });
  }, [a, b]);
  await page.evaluate(() => { state.newTries = ''; state.mastery[FACT_INDEX['2x3']] = 3; });
  await ask(2, 7);
  await answer(page, false); // a miss counts as 0
  await answer(page, true); // the right answer after it adds nothing
  await page.waitForTimeout(2100);
  await ask(2, 7);
  await answer(page, true); // she missed it this round, so it doesn't count
  await page.waitForTimeout(1900);
  await ask(2, 3);
  await answer(page, true); // a sticker, so it doesn't count
  await page.waitForTimeout(1900);
  await ask(2, 8);
  await answer(page, true);
  expect(await page.evaluate(() => state.newTries)).toBe('01');
});

test('a new fact that had its dot or a miss today waits, unless nothing else is left', async ({ page }) => {
  const picks = await page.evaluate(() => {
    startRound('main');
    game.index = game.slots.indexOf('N');
    const pool = () => pathPool();
    const step = PATH_FACTS[0];
    for (const k of step) { const i = FACT_INDEX[k]; state.mastery[i] = 2; state.days[i] = today(); }
    state.mastery[FACT_INDEX['2x5']] = 1; state.days[FACT_INDEX['2x5']] = today() - 1; // yesterday's dot: it can earn one today
    const one = pool();
    state.mastery[FACT_INDEX['2x6']] = 0; // missed today: it waits too
    const two = pool();
    state.days[FACT_INDEX['2x5']] = today();
    const none = pool(); // every new fact waits and nothing is known yet, so it asks one anyway
    state.mastery[FACT_INDEX['2x2']] = STICKER_AT; state.days[FACT_INDEX['2x2']] = today(); state.levels[FACT_INDEX['2x2']] = 0;
    const known = pool(); // a known fact goes ahead of one that can't earn a dot
    goHome();
    return { one, two, none: none.length, known };
  });
  expect(picks.one).toEqual(['2x5']);
  expect(picks.two).toEqual(['2x5']);
  expect(picks.none).toBe(21);
  expect(picks.known).toEqual(['2x2']);
});

test('retries wait for review questions, and a late retry comes next round', async ({ page }) => {
  const out = await page.evaluate(() => {
    // Stickers on every table, so teaching questions have only the fact below and there is nothing to peek at
    for (const k of PATH_FACTS.flat()) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    state.mastery[FACT_INDEX['2x7']] = 0;
    state.days[FACT_INDEX['2x7']] = 0; // not tried today, so it can earn a dot
    startRound('main');
    const kinds = [];
    // A retry due on question 2 and 3, a new fact and a leftover
    game.retries = [{ a: 2, b: 9, div: false, key: '2x9', at: 1 }];
    for (let i = 1; i <= 3; i++) {
      game.index = i;
      nextQuestion();
      kinds.push(keyOf(game));
      state.days[FACT_INDEX['2x7']] = today(); // she answered it
    }
    // A retry that is never due this round carries into the next one
    game.retries = [{ a: 2, b: 8, div: false, key: '2x8', at: 11 }];
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
    startRound('main');
    const next = keyOf(game);
    // but not into practice
    game.retries = [{ a: 2, b: 8, div: false, key: '2x8', at: 11 }];
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
    startRound('practice', 5);
    const practice = game.retries.length;
    goHome();
    return { kinds, next, practice };
  });
  // Question 2 teaches 2 × 7, question 3 keeps its leftover slot for review, and question 4 has the retry
  expect(out.kinds[0]).toBe('2x7');
  expect(out.kinds[1]).not.toBe('2x9');
  expect(out.kinds[2]).toBe('2x9');
  expect(out.next).toBe('2x8'); // the next round asks it first
  expect(out.practice).toBe(0);
});

test('a retry in a real round doesn\'t take a teaching question', async ({ page }) => {
  const out = await page.evaluate(() => {
    for (const k of PATH_FACTS.flat()) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    for (const k of ['2x7', '7x2', '2x9']) { state.mastery[FACT_INDEX[k]] = 0; state.days[FACT_INDEX[k]] = 0; }
    const rounds = [];
    for (let r = 0; r < 30; r++) {
      startRound('main');
      const keys = [];
      for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
        game.index = i;
        if (i > 0) nextQuestion(); // startRound asked the first one
        keys.push(keyOf(game));
        // She misses the first question, so it comes back
        if (i === 0) game.retries.push({ a: game.a, b: game.b, div: false, key: keyOf(game), at: 3 });
      }
      rounds.push({ keys, teach: [...game.slots].flatMap((s, i) => TEACH_SLOTS.includes(s) ? [i] : []) });
      clearTimers();
    }
    goHome();
    return rounds;
  });
  for (const { keys, teach } of out) {
    // Every teaching question asks a fact without a sticker
    for (const i of teach) expect(['2x7', '7x2', '2x9'], keys.join(' ')).toContain(keys[i]);
    expect(keys.filter((k, i) => i > 0 && k === keys[0]).length).toBeGreaterThan(0);
  }
});

test('facts missed earlier today come back on review questions in later rounds, with no dot', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await page.evaluate(() => { game.peekNow = false; });
  await askFact(page, 2, 7);
  await answer(page, false);
  await answer(page, true);
  const out = await page.evaluate(() => {
    for (const k of ['2x8', '2x9', '7x2']) { state.missedKeys.push(k); state.days[FACT_INDEX[k]] = today(); }
    // 16 of the 21 ×2 stickers, so review asks only stickers, and new facts only 2 × 6, the one not missed today
    const left = ['2x6', '2x7', '2x8', '2x9', '7x2'];
    for (const k of PATH_FACTS[0].filter(k => !left.includes(k))) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    const rounds = [];
    for (let r = 0; r < 20; r++) {
      clearTimers();
      startRound('main');
      const kinds = [];
      for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
        game.index = i;
        if (i) nextQuestion();
        kinds.push(game.redoNow ? keyOf(game) : game.peekNow ? 'peek' : game.slots[i] === 'N' ? 'new' : 'review');
      }
      rounds.push(kinds);
    }
    // 4 new facts leave room for 1, easier mode keeps 2, and tomorrow there are none
    const count = () => { clearTimers(); startRound('main'); return game.redo.length; };
    state.fastPath = true; const fast = count();
    state.easyPath = true; const easy = count();
    state.easyPath = false; state.fastPath = false;
    const d = today(); window.today = () => d + 1; const tomorrow = count();
    goHome();
    return { rounds, fast, easy, tomorrow, mastery: state.mastery[FACT_INDEX['2x7']] };
  });
  // The oldest misses first, then each one asked goes to the back, so all of them get practice
  expect(out.rounds[0].filter(k => k.includes('x'))).toEqual(['2x7', '2x8']);
  expect(out.rounds[1].filter(k => k.includes('x'))).toEqual(['2x9', '7x2']);
  for (const kinds of out.rounds) {
    // 1 peek, 3 new, 2 missed, and review, as ×2 has no leftovers: missed facts on questions 4 and 9, the peek on 6
    expect(kinds[5]).toBe('peek');
    expect([kinds[3], kinds[8]].every(k => k.includes('x'))).toBe(true);
    expect(kinds.filter(k => k.includes('x')).length).toBe(2);
    expect(kinds.filter(k => k === 'new').length).toBe(3);
  }
  expect([out.fast, out.easy, out.tomorrow]).toEqual([1, 2, 0]);
  expect(out.mastery).toBe(0);
});

test('a fact missed earlier today never comes right after itself', async ({ page }) => {
  const out = await page.evaluate(() => {
    // 16 of the 21 ×2 stickers, so review asks only stickers, and ×2 is not done
    const left = ['2x6', '2x7', '2x8', '2x9', '7x2'];
    for (const k of PATH_FACTS[0].filter(k => !left.includes(k))) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
    state.missedDay = today();
    state.missedKeys = ['2x3'];
    const ask = prev => {
      clearTimers();
      startRound('main');
      Object.assign(game, { index: game.slots.indexOf('M'), prevKey: prev, redo: ['2x3'] });
      nextQuestion();
      return [game.redoNow, keyOf(game) === prev];
    };
    const same = ask('2x3'); // she was just asked 2 × 3
    const other = ask('2x6'); // she is learning 2 × 6
    goHome();
    return { same, other };
  });
  expect(out.same).toEqual([false, false]);
  expect(out.other).toEqual([true, false]);
});

test('a missed fact asked again today pays but earns no dot, and its miss does not make the path easier', async ({ page }) => {
  await page.evaluate(() => { state.missedDay = today(); state.missedKeys = ['6x7']; state.mastery[FACT_INDEX['6x7']] = 1; state.days[FACT_INDEX['6x7']] = today(); saveState(); });
  await page.reload();
  await page.locator('#pathBtn').click();
  expect(await page.evaluate(() => game.redo)).toEqual(['6x7']);
  await page.evaluate(() => { game.redoNow = true; game.peekNow = false; game.redo = []; game.track = false; });
  await askFact(page, 6, 7);
  const cents = await page.evaluate(() => state.totalCents);
  await answer(page, true);
  expect(await page.evaluate(() => [state.mastery[FACT_INDEX['6x7']], state.totalCents - centsFor(6, 7)])).toEqual([1, cents]);
  await page.waitForTimeout(1900);
  await page.evaluate(() => { game.redoNow = true; });
  await askFact(page, 6, 7);
  await answer(page, false);
  expect(await page.evaluate(() => {
    game.firstTry = 6; // 6 right first time, and one miss on a fact she missed earlier today
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
    return [game.freeMisses, state.easyPath, state.missedKeys];
  })).toEqual([1, false, ['6x7']]);
});

test('leftover questions go to facts a finished table left without a sticker, and new ones to the current table', async ({ page }) => {
  const r = await page.evaluate(() => {
    // ×2 and ×10 are done with a few facts left at 0 dots, as in a save from before the path
    const left = [];
    for (const s of [0, 1]) for (const k of PATH_NEW[s]) {
      state.mastery[FACT_INDEX[k]] = 0;
      if (tableDone(PATH_NEW, s)) left.push(k); else state.mastery[FACT_INDEX[k]] = STICKER_AT;
    }
    saveState();
    const picks = [];
    let third = 0;
    for (let i = 0; i < 30; i++) {
      startRound('main');
      game.index = game.slots.indexOf('L');
      let q = pickQuestion();
      picks.push(factKey(q.a, q.b));
      game.index = game.slots.indexOf('N');
      q = pickQuestion();
      if (PATH_NEW[2].includes(factKey(q.a, q.b))) third++;
      clearTimers();
    }
    // Once none can earn a dot today, the leftover question teaches the current table
    for (const k of left) state.days[FACT_INDEX[k]] = today();
    startRound('main');
    game.index = game.slots.indexOf('L');
    nextQuestion();
    const current = PATH_NEW[2].includes(keyOf(game));
    // and once that had its dots too, it practices a leftover again, with no dot and a free miss
    for (const k of PATH_NEW[2]) state.days[FACT_INDEX[k]] = today();
    nextQuestion();
    const again = [left.includes(keyOf(game)), game.againNow, game.track];
    // A missed one waits for a missed-fact question, so with all of them missed it is review
    state.missedDay = today();
    state.missedKeys = [...left];
    nextQuestion();
    const missed = hasSticker(keyOf(game));
    clearTimers();
    return { step: pathStep(), some: left.length > 0, all: picks.every(k => left.includes(k)), third, current, again, missed };
  });
  expect(r).toEqual({ step: 2, some: true, all: true, third: 30, current: true, again: [true, true, false], missed: true });
});

test('a sneak peek at a later table earns a dot, stays with that table, and a miss costs nothing', async ({ page }) => {
  await page.locator('#pathBtn').click();
  // Goes to the peek question of the round
  const toPeek = () => page.evaluate(() => { game.index = game.slots.indexOf('P'); nextQuestion(); });
  await toPeek();
  // On ×2 it peeks at ×10, the next table with facts that can earn a dot
  const first = await page.evaluate(() => [game.peekNow, PATH_NEW[1].includes(keyOf(game)), state.peekStep]);
  expect(first).toEqual([true, true, 1]);
  await askFact(page, 10, 3);
  await answer(page, true);
  expect(await page.evaluate(() => [state.mastery[FACT_INDEX['10x3']], state.days[FACT_INDEX['10x3']] === today()])).toEqual([1, true]);
  await page.waitForTimeout(1900);
  // The next peek comes from ×10 again. Missing it gives no retry and no practice later today
  const missed = await page.evaluate(() => {
    clearTimers();
    startRound('main');
    game.index = game.slots.indexOf('P');
    nextQuestion();
    return [game.peekNow, PATH_NEW[1].includes(keyOf(game))];
  });
  expect(missed).toEqual([true, true]);
  await askFact(page, 10, 4);
  await answer(page, false);
  expect(await page.evaluate(() => [game.retries.map(r => r.key), state.missedKeys, game.freeMisses, state.peekStep, state.days[FACT_INDEX['10x4']] === today()]))
    .toEqual([[], [], 1, 2, true]);
  // The next peek tries ×5, and stays a peek after a reload
  await page.evaluate(() => { clearTimers(); saveState(); });
  await page.reload();
  await page.locator('#pathBtn').click();
  await toPeek();
  expect(await page.evaluate(() => [game.peekNow, PATH_NEW[2].includes(keyOf(game))])).toEqual([true, true]);
});

test('after the last sleepy sticker wakes, Ms. Menna says her usual line, not one that sounds like the day is done', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    for (let i = 0; i < state.mastery.length; i++) if (state.mastery[i] >= STICKER_AT) state.days[i] = today();
    game.woken.push({ a: 2, b: 2, div: false });
    game.index = QUESTIONS_PER_ROUND;
    nextQuestion();
  });
  await expect(page.locator('#summaryBubble')).toHaveText(/\S/);
  await expect(page.locator('#summaryBubble')).not.toContainText('every sleepy sticker');
  await expect(page.locator('#summaryBubble')).not.toContainText('tomorrow');
});

test('the round summary shows what she did today and what can still happen today, with empty rows hidden', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    for (const k of ['3x4', '3x5']) { const i = FACT_INDEX[k]; state.mastery[i] = k === '3x4' ? 1 : 0; state.days[i] = today() - 1; }
  });
  await askFact(page, 3, 4);
  await answer(page, true); // second dot
  await askFact(page, 3, 5);
  await answer(page, true); // first dot
  const day = await page.evaluate(() => stats.days[today()]);
  expect(day.d2).toBe(1);
  expect(day.d1).toBe(1);
  await page.evaluate(() => {
    const i = FACT_INDEX['2x4']; state.mastery[i] = 2; state.days[i] = today() - 1; // one dot from a sticker
    const j = FACT_INDEX['7x8']; state.mastery[j] = 2; state.days[j] = today() - 1; // a later table the path can't ask yet
    game.index = QUESTIONS_PER_ROUND; nextQuestion();
  });
  const card = page.locator('#todayCard');
  await expect(card).toBeVisible();
  await expect(card).toContainText('1 got their 2nd dot');
  await expect(card).toContainText('1 got their first dot');
  await expect(card).toContainText('1 more can');
  await expect(card).not.toContainText('Sleepy');
  await expect(card).not.toContainText(/\b0 /);
});

test('after a round, her plain line says how many dots the round earned', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const bubble = page.locator('#summaryBubble');
  const summary = (firstTry, dots) => page.evaluate(([f, d]) => {
    Object.assign(game, { firstTry: f, dots: d, newStickers: [], index: QUESTIONS_PER_ROUND }); nextQuestion();
  }, [firstTry, dots]);
  await summary(9, 3);
  await expect(bubble).toContainText('You got 3 dots this round! 🐾');
  await summary(7, 1);
  await expect(bubble).toContainText('Great job! You got 1 dot this round! 🐾');
  await summary(4, 2);
  await expect(bubble).toContainText('You got 2 dots this round! Keep going! 💪');
  await summary(7, 0);
  await expect(bubble).toContainText('Great job! 🐾');
  await expect(bubble).not.toContainText('this round');
  await page.evaluate(() => { chartGarden = true; });
  await summary(7, 2);
  await expect(bubble).toContainText('Great job! 2 plants grew this round! 🐾');
});

test('after a round, Ms. Menna names the nearest reward left today: stickers, then second dots, then sleepy stickers, then what she did today', async ({ page }) => {
  await page.locator('#pathBtn').click();
  const summary = () => page.evaluate(() => { game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  const set = (k, m, ago, lv = 0) => page.evaluate(([k, m, ago, lv]) => {
    const i = FACT_INDEX[k]; state.mastery[i] = m; state.days[i] = today() - ago; state.levels[i] = lv;
  }, [k, m, ago, lv]);
  const bubble = page.locator('#summaryBubble');
  await set('2x3', 1, 1);
  await set('2x4', 2, 1);
  await set('2x5', 3, 5);
  await set('7x8', 2, 1); // a later table, never counted
  await summary();
  await expect(bubble).toContainText('1 more can become a sticker today! ⭐');
  await set('2x4', 2, 0);
  await summary();
  await expect(bubble).toContainText('1 fact can get its second dot today! 🟡');
  await set('2x3', 1, 0);
  await summary();
  await expect(bubble).toContainText('1 sleepy sticker wants to wake up! 💤');
  await set('2x5', 3, 0);
  await page.evaluate(() => { stats.days[today()] = { s: 2, d: 5, d1: 3, w: 1 }; });
  await summary();
  await expect(bubble).toContainText("Today you got 5 dots and 2 stickers and woke up 1 sleepy sticker! Let's find new facts! 🌱");
  await expect(bubble).not.toContainText('tomorrow');
  // Garden mode says it with plants
  await page.evaluate(() => { chartGarden = true; });
  await summary();
  await expect(bubble).toContainText("Today you helped plants grow 5 times, grew 2 plants all the way and woke up 1 sleepy plant! Let's find new facts! 🌱");
  await set('2x3', 1, 1);
  await summary();
  await expect(bubble).toContainText('1 plant can grow again today! 🌿');
});

// Every times fact up to 10 has a sticker earned today.
const learnAllTimes = page => page.evaluate(() => {
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) { const i = FACT_INDEX[factKey(a, b)]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; }
  saveState();
  renderPath();
});
const endRound = page => page.evaluate(() => { game.firstTry = 9; game.index = QUESTIONS_PER_ROUND; nextQuestion(); });

test('Learn with Ms. Menna ends at ×10, and practice visits sleepy bigger stickers', async ({ page }) => {
  await learnAllTimes(page);
  await page.evaluate(() => {
    const set = (k, ago, level) => { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today() - ago; state.levels[i] = level; };
    set('6x15', 30, 4); // sleepy, earned with the number buttons before v22
    set('3x17', 0, 0);
    saveState();
  });
  await expect(page.locator('#pathNow')).toHaveText('All tables done! 121 of 121 stickers · Mixed review 🏆');
  const main = (await playRounds(page, 'main', 20)).flat();
  expect(main.filter(q => q.a > 10 || q.b > 10 || q.div)).toEqual([]);
  const practice = (await playRounds(page, 'practice', 20, 16)).flat();
  expect(practice.filter(q => q.key === '6x15').length).toBeGreaterThan(0);
  expect(practice.filter(q => q.a > 16 || q.b > 16)).toEqual([]);
});

test('after the times tables, Ms. Menna invites her to divide, and asks again 3 days after "Not yet"', async ({ page }) => {
  test.setTimeout(30000); // takes about 15 seconds on its own
  await learnAllTimes(page);
  // Not after practice, only after the path
  await page.evaluate(() => startRound('practice', 5));
  await endRound(page);
  await expect(page.locator('#divideInvite')).toBeHidden();

  await page.locator('#againBtn').click();
  await page.evaluate(() => startRound('main'));
  await endRound(page);
  await expect(page.locator('#divideInvite')).toBeVisible();
  await expect(page.locator('#summaryBubble')).toContainText('Want to learn dividing next?');
  await expect(page.locator('#againBtn')).toBeVisible();
  await page.locator('#inviteNoBtn').click();
  await expect(page.locator('#divideInvite')).toBeHidden();
  expect(await page.evaluate(() => [state.divOn, state.divAsked === today()])).toEqual([false, true]);

  await page.locator('#againBtn').click();
  await endRound(page);
  await expect(page.locator('#divideInvite')).toBeHidden();
  await page.evaluate(() => { state.divAsked = today() - 3; saveState(); });
  await page.locator('#againBtn').click();
  await endRound(page);
  await expect(page.locator('#divideInvite')).toBeVisible();

  // "Yes" shows the first lesson, then a round that teaches ÷2
  await page.locator('#inviteYesBtn').click();
  await expect(page.locator('#divideScreen')).toHaveClass(/active/);
  await expect(page.locator('#divideBubble')).toContainText('12 ÷ 3');
  await expect(page.locator('#shareAnswer')).toHaveText('4', { timeout: 10000 });
  await expect(page.locator('#shareDots .share-row')).toHaveCount(3);
  await page.locator('#divideGoBtn').click();
  await expect(page.locator('#gameScreen')).toHaveClass(/active/);
  expect(await page.evaluate(() => [state.divOn, state.divIntro, game.guided])).toEqual([true, true, true]);
  await page.reload();
  await expect(page.locator('#divideToggle')).toBeChecked();
  await expect(page.locator('#pathNow')).toHaveText('Learning ÷2 · 0 of 19 stickers');
});

test('outside division lessons, question 7 teaches division of a learned table, and question 10 reviews it', async ({ page }) => {
  const out = await page.evaluate(() => {
    const give = keys => { for (const k of keys) { const i = FACT_INDEX[k]; state.mastery[i] = STICKER_AT; state.days[i] = today(); state.levels[i] = 0; } };
    const fourth = () => Array.from({ length: 20 }, () => {
      clearTimers();
      startRound('main');
      for (let i = 1; i <= 6; i++) { game.index = i; nextQuestion(); }
      return keyOf(game);
    });
    state.divOn = true;
    // ×2 is done, and every ÷2 fact has a sticker except 14 ÷ 2 and 14 ÷ 7
    give(PATH_FACTS[0]);
    give(DIVIDE_FACTS[0].filter(k => !['d2x7', 'd7x2'].includes(k)));
    const during = new Set(fourth());
    // Facts missed earlier today on questions 4 and 9, the peek on 6
    state.missedDay = today();
    state.missedKeys = ['2x3', '2x4', '2x5'];
    clearTimers();
    startRound('main');
    const kinds = [];
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      game.index = i;
      if (i) nextQuestion();
      kinds.push(game.peekNow ? 'peek' : game.redoNow ? 'missed' : game.div ? 'div' : 'times');
    }
    state.missedKeys = [];
    const layouts = [[false, false], [true, false], [false, true]].map(([easy, fast]) => {
      state.easyPath = easy; state.fastPath = fast;
      clearTimers();
      startRound('main');
      return game.slots;
    });
    state.easyPath = state.fastPath = false;
    // Every times and division table is done, with 14 ÷ 2 left over. ÷9 adds only 3 facts, so one left there
    // would keep ÷9 under 80%.
    give(PATH_FACTS.flat());
    give(DIVIDE_FACTS.flat().filter(k => k !== 'd2x7'));
    const after = new Set(fourth());
    const guided = game.guided;
    goHome();
    return { during: [...during].sort(), after: [...after], guided, kinds, layouts };
  });
  expect(out.kinds).toEqual(['times', 'times', 'times', 'missed', 'times', 'peek', 'div', 'times', 'missed', 'div']);
  // Normal, easier and 4 new facts
  expect(out.layouts).toEqual(['RNLMNPlNMr', 'RNRMlPRNMr', 'RNLMNPlNNr']);
  expect(out.during).toEqual(['d2x7', 'd7x2']);
  expect(out.after).toEqual(['d2x7']);
  expect(out.guided).toBe(false);
});

test('the path teaches division table by table, with times facts on review and missed-fact questions', async ({ page }) => {
  await learnAllTimes(page);
  await divideOn(page);
  // While she knows few ÷2 facts, every division slot is one she is learning
  const first = (await playRounds(page, 'main', 5)).flat().filter(q => q.div);
  expect(first.filter(q => q.sticker)).toEqual([]);
  await giveStickers(page, tableKeys(2, 1, 6).map(k => 'd' + k)); // 11 of the 19 ÷2 facts
  const rounds = await playRounds(page, 'main', 30);
  const divides = rounds.map(round => round.filter(q => q.div));
  // With every times fact learned, leftover questions teach ÷2 too, so only R and the 2 M questions are times
  for (const d of divides) expect(d.length).toBe(7);
  // ÷2 only, from both sides: 14 ÷ 2 and 14 ÷ 7, and a sneak peek at ÷10
  expect(divides.flat().filter(q => !q.peek && q.a !== 2 && q.b !== 2)).toEqual([]);
  expect(divides.flat().filter(q => q.peek && q.a !== 10 && q.b !== 10)).toEqual([]);
  const newOnes = divides.map(d => d.filter(q => !q.sticker && !q.peek).length);
  expect(Math.min(...newOnes)).toBe(5);
  expect(rounds.flat().filter(q => !q.div && (q.a > 10 || q.b > 10))).toEqual([]);

  // At 80% of ÷2, it moves on to ÷10
  await giveStickers(page, [...tableKeys(2, 1, 8), '2x9'].map(k => 'd' + k)); // 16 of 19
  await expect(page.locator('#pathNow')).toHaveText('Learning ÷10 · 0 of 17 stickers');
  const next = (await playRounds(page, 'main', 10)).flat().filter(q => q.div);
  // New facts are ÷10, or ÷2 facts still without a sticker, as on the times path
  expect(next.filter(q => !q.peek && ![2, 10].includes(q.a) && ![2, 10].includes(q.b) && !q.sticker)).toEqual([]);
  expect(next.some(q => q.a === 10 || q.b === 10)).toBe(true);
});

test('the first division questions show their picture right away', async ({ page }) => {
  await learnAllTimes(page);
  await page.evaluate(() => { state.divOn = state.divIntro = true; state.divPics = 3; saveState(); });
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    game.index = 1;
    nextQuestion(); // a new division fact
  });
  expect(await page.evaluate(() => game.div)).toBe(true);
  await expect(page.locator('#gridArea')).toHaveClass(/show/, { timeout: 4000 });
  await expect(page.locator('#gameBubble')).toContainText('× ? =');
  expect(await page.evaluate(() => state.divPics)).toBe(2);
  // A picture she didn't ask for keeps the full pay
  await expect(page.locator('#worth')).toHaveText(/^This one pays \d+ coins?!$/);
  const want = await page.evaluate(() => centsFor(game.a, game.b));
  const before = await page.evaluate(() => state.totalCents);
  await answer(page, true);
  expect(await page.evaluate(b => state.totalCents - b, before)).toBe(want);
});

test('switching division on the first time shows the lesson; a v22 save that divided keeps it on', async ({ page }) => {
  await page.locator('.divide-toggle').click();
  await expect(page.locator('#divideScreen')).toHaveClass(/active/);
  await page.locator('#divideGoBtn').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/);
  await expect(page.locator('#divideToggle')).toBeChecked();
  await page.locator('.divide-toggle').click();
  await expect(page.locator('#divideToggle')).not.toBeChecked();
  await page.locator('.divide-toggle').click();
  await expect(page.locator('#startScreen')).toHaveClass(/active/); // no lesson the second time
  await expect(page.locator('#divideToggle')).toBeChecked();

  await page.evaluate(() => {
    const m = OLD_TIMES_KEYS.map(() => 0).concat(OLD_DIVIDE_KEYS.map(k => (k === 'd2x3' ? 1 : 0))); // the v22 layout
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 4, totalCents: 10, mastery: m.join(''), savedAt: Date.now() + 5000 }));
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
  });
  await page.reload();
  expect(await page.evaluate(() => [state.divOn, state.divIntro])).toEqual([true, true]);
});

test('an older plain cookie still loads, and is saved again compressed', async ({ page }) => {
  await page.evaluate(() => {
    const old = { totalCents: 615, gems: 8, mastery: '3'.repeat(210), savedAt: Date.now() };
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(old))}; path=/`;
  });
  await page.reload();
  await expect(page.locator('#startBankAmount')).toHaveText('615 coins');
  const saved = await page.evaluate(() => ({
    gems: state.gems,
    lz: document.cookie.includes(COOKIE_NAME + '=' + COOKIE_LZ),
    cookie: readCookie().v,
    local: JSON.parse(localStorage.getItem(STORE_KEY)).v,
    times: TIMES_KEYS.filter(hasSticker).length,
    divide: DIVIDE_KEYS.filter(hasSticker).length,
  }));
  // The 210 shared stickers are now 400: 20 squares like 3 × 3, and 190 pairs like 3 × 7 and 7 × 3
  const v = await page.evaluate(() => SAVE_VERSION);
  expect(saved).toEqual({ gems: 8, lz: true, cookie: v, local: v, times: 400, divide: 0 });
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

// Ends the round now, as if the last question was just answered.
async function finishRound(page) {
  await page.evaluate(() => { game.index = QUESTIONS_PER_ROUND; nextQuestion(); });
  await expect(page.locator('#summaryScreen')).toHaveClass(/active/);
}

test('Trade In shows the grown-up what she learned since the last trade-in, and trading starts it again', async ({ page }) => {
  await page.locator('#cashoutBtn').click();
  await expect(page.locator('#parentNote')).toBeHidden();
  await page.locator('#cashBackBtn').click();
  await page.locator('#pathBtn').click();
  // A sticker she is about to earn, then a miss on another fact
  const q = await page.evaluate(() => {
    const i = FACT_INDEX[keyOf(game)];
    state.mastery[i] = STICKER_AT - 1;
    state.days[i] = today() - 1;
    return questionText(game);
  });
  await answer(page, true);
  await page.waitForTimeout(2000);
  const missed = await answer(page, false);
  await finishRound(page);
  await page.locator('#homeBtn').click();
  await page.reload(); // it is in the save
  await page.locator('#cashoutBtn').click();
  const note = page.locator('#parentNote');
  await expect(note).toBeVisible();
  await expect(note).toContainText('⭐ 1 new sticker · 💤 0 sleepy stickers woken');
  const missedText = await page.evaluate(m => questionText(m), missed);
  await expect(note).toContainText(`Tricky facts: ${missedText} (missed 1 time)`);
  expect(missedText).not.toBe(q);
  // Above the money
  const [noteTop, bankTop] = await Promise.all(['#parentNote', '#cashBank'].map(s => page.locator(s).boundingBox().then(b => b.y)));
  expect(noteTop).toBeLessThan(bankTop);
  await page.locator('#payBtn').click();
  await page.waitForTimeout(1300);
  await page.locator('#payYesBtn').click();
  await expect(note).toBeHidden();
  expect(await page.evaluate(() => state.since)).toEqual({ s: 0, w: 0, m: {} });
});

test('the 3 most-missed facts are the tricky ones, and only a few are kept in the save', async ({ page }) => {
  await page.evaluate(() => {
    for (let n = 0; n < 20; n++) for (let t = 0; t <= n % 5; t++) noteMiss(MAIN_KEYS[n]);
    saveState();
    showCashout();
  });
  const kept = await page.evaluate(() => [Object.keys(state.since.m).length, TRICKY_KEPT]);
  expect(kept).toEqual([12, 12]);
  const tricky = await page.evaluate(() => [4, 9, 14].map(n => `${keyText(MAIN_KEYS[n])} (missed 5 times)`).join(', '));
  await expect(page.locator('#parentNote')).toContainText('Tricky facts: ' + tricky);
});

test('sleepy stickers snooze under a quilt at home, and waking one makes it stretch', async ({ page }) => {
  await expect(page.locator('#quilt')).toBeHidden();
  await page.evaluate(() => {
    for (const k of MAIN_KEYS.slice(0, 8)) {
      const i = FACT_INDEX[k];
      state.mastery[i] = STICKER_AT;
      state.levels[i] = SLEEPY_NOW;
      state.days[i] = today() - 1;
    }
    renderPath();
  });
  await expect(page.locator('#quilt')).toBeVisible();
  await expect(page.locator('#quiltFriends span')).toHaveCount(6);
  await expect(page.locator('#quiltCount')).toHaveText('8 sleepy stickers 💤');
  await page.locator('#pathBtn').click();
  await page.evaluate(() => {
    const [a, b] = factsOf(MAIN_KEYS[0]);
    Object.assign(game, { a, b, div: false });
  });
  await answer(page, true);
  await expect(page.locator('.banner .stretch')).toBeVisible();
  await expect(page.locator('.banner')).toContainText('woke up!');
  await finishRound(page);
  await page.locator('#homeBtn').click();
  await expect(page.locator('#quiltCount')).toHaveText('7 sleepy stickers 💤');
});

test('every 10th sticker brings a free treat at the end of the round, and older stickers bring none', async ({ page }) => {
  await page.evaluate(() => {
    for (const k of MAIN_KEYS.slice(0, 9)) state.mastery[FACT_INDEX[k]] = STICKER_AT;
    saveState();
  });
  await page.locator('#pathBtn').click();
  await page.evaluate(() => { state.mastery[FACT_INDEX[MAIN_KEYS[9]]] = STICKER_AT; });
  await finishRound(page);
  await expect(page.locator('#giftNote')).toBeVisible();
  await expect(page.locator('#giftNote')).toContainText("A present for you! 🦴 Dog Bone for Ms. Menna's treat jar!");
  expect(await page.evaluate(() => [state.gifts, state.treats.bone])).toEqual([1, 1]);
  // No new tenth sticker, no gift
  await page.locator('#againBtn').click();
  await finishRound(page);
  await expect(page.locator('#giftNote')).toBeHidden();
  expect(await page.evaluate(() => state.treats.bone)).toBe(1);

  // A save from before v45 with 25 stickers gets no gifts for them; the 30th brings one
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem(STORE_KEY));
    delete save.gifts;
    save.treats = {};
    save.mastery = FACT_KEYS.map((k, i) => (MAIN_KEYS.slice(0, 25).includes(k) ? STICKER_AT : 0)).join('');
    save.savedAt = Date.now() + 1000;
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
  });
  await page.reload();
  expect(await page.evaluate(() => state.gifts)).toBe(2);
  await page.locator('#pathBtn').click();
  await finishRound(page);
  await expect(page.locator('#giftNote')).toBeHidden();
  await page.locator('#againBtn').click();
  await page.evaluate(() => { for (const k of MAIN_KEYS.slice(25, 30)) state.mastery[FACT_INDEX[k]] = STICKER_AT; });
  await finishRound(page);
  await expect(page.locator('#giftNote')).toContainText('🍎 Apple'); // the third gift
});

test('home counts the days with a finished round, and an older save starts at 1', async ({ page }) => {
  await expect(page.locator('#daysTotal')).toBeHidden();
  await page.locator('#pathBtn').click();
  await page.locator('#quitBtn').click();
  await expect(page.locator('#daysTotal')).toBeHidden(); // a round left early does not count
  await page.locator('#pathBtn').click();
  await finishRound(page);
  await page.locator('#againBtn').click();
  await finishRound(page); // a second round the same day
  await page.locator('#homeBtn').click();
  await expect(page.locator('#daysTotal')).toHaveText('📅 Days with Ms. Menna: 1');
  await page.evaluate(() => { state.playDay = today() - 1; saveState(); });
  await page.locator('#pathBtn').click();
  await finishRound(page);
  await page.locator('#homeBtn').click();
  await expect(page.locator('#daysTotal')).toHaveText('📅 Days with Ms. Menna: 2');

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem(STORE_KEY));
    delete save.playDays; delete save.playDay;
    save.savedAt = Date.now() + 1000;
    localStorage.setItem(STORE_KEY, JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#daysTotal')).toHaveText('📅 Days with Ms. Menna: 1');
  await page.locator('#pathBtn').click();
  await finishRound(page);
  await page.locator('#homeBtn').click();
  await expect(page.locator('#daysTotal')).toHaveText('📅 Days with Ms. Menna: 1'); // today was already counted
});

test('a stale tab keeps the other tab\'s gifts, days and since-trade-in record', async ({ page }) => {
  await page.evaluate(() => {
    Object.assign(state, { gifts: 1, playDays: 3, playDay: today() - 1, since: { s: 2, w: 1, m: { '3x4': 2 } } });
    saveState();
    // Another tab cashes out, gives a gift and counts today
    const other = JSON.parse(localStorage.getItem(STORE_KEY));
    Object.assign(other, { gifts: 2, playDays: 4, playDay: today(), since: { s: 0, w: 0, m: {} }, savedAt: Date.now() + 5000 });
    localStorage.setItem(STORE_KEY, JSON.stringify(other));
    // This tab then sees one more sticker and a miss
    state.since.s++;
    noteMiss('6x7');
    saveState();
  });
  const st = await page.evaluate(() => [state.gifts, state.playDays, state.playDay - today(), state.since]);
  expect(st).toEqual([2, 4, 0, { s: 1, w: 0, m: { '6x7': 1 } }]);
});

// v46: facts with 0, 1 or 10, and ÷ 1 or ÷ 10, need 2 days for a sticker.
test('easy facts with 0, 1 or 10 earn their sticker on the second day', async ({ page }) => {
  const easy = await page.evaluate(() => {
    const main = FACT_KEYS.filter(k => Math.max(...factsOf(k)) <= 10);
    return [main.filter(k => !k.startsWith('d') && isEasyFact(k)).length, main.filter(k => k.startsWith('d') && isEasyFact(k)).length,
      ['0x7', '7x1', '10x4', 'd10x4', 'd1x8', 'd4x10', 'd7x1', '6x8'].map(isEasyFact)];
  });
  expect(easy).toEqual([57, 20, [true, true, true, true, true, false, false, false]]);

  await page.locator('#pathBtn').click();
  // A dot today: the next one waits, and the sticker is one day away
  await setFact(page, '10x4', 1, 0);
  await askFact(page, 10, 4);
  await answer(page, true);
  await expect(page.locator('#gameBubble')).toContainText('One dot! Get it right tomorrow for the sticker!');
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['10x4']])).toBe(1);
  await page.waitForTimeout(1900);
  // A dot yesterday: the second dot is the sticker
  await setFact(page, '10x4', 1, 1);
  await askFact(page, 10, 4);
  await answer(page, true);
  expect(await page.evaluate(() => [hasSticker('10x4'), game.newStickers.some(f => keyOf(f) === '10x4')])).toEqual([true, true]);
});

test('easy facts saved with 2 dots before v46 have their sticker, and other facts keep their dots', async ({ page }) => {
  await page.evaluate(() => {
    state.mastery[FACT_INDEX['1x6']] = 2; state.days[FACT_INDEX['1x6']] = today() - 3;
    state.mastery[FACT_INDEX['6x8']] = 2; state.days[FACT_INDEX['6x8']] = today() - 3;
    state.mastery[FACT_INDEX['0x9']] = 1;
    saveState();
    // Saved by v45, the last version before the 2-dot rule
    const old = JSON.parse(localStorage.getItem(STORE_KEY));
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...old, v: 25, savedAt: Date.now() + 5000 }));
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/`;
  });
  await page.reload();
  const got = await page.evaluate(() => ['1x6', '6x8', '0x9'].map(k => [state.mastery[FACT_INDEX[k]] === STICKER_AT, state.mastery[FACT_INDEX[k]], isSleepy(FACT_INDEX[k])]));
  expect(got).toEqual([[true, 3, false], [false, 2, false], [false, 1, false]]);
  // A v46 save never holds an easy fact at 2 dots, but if one did, it would stay as saved
  await page.evaluate(() => { state.mastery[FACT_INDEX['1x7']] = 2; saveState(); });
  await page.reload();
  expect(await page.evaluate(() => state.mastery[FACT_INDEX['1x7']])).toBe(2);
});

test('grown-up stats in Trade In count rounds, first tries, dots and time, and stay out of the save and cookie', async ({ page }) => {
  await page.locator('#pathBtn').click();
  await answer(page, true);
  await page.waitForTimeout(1500);
  await answer(page, false);
  await finishRound(page);
  await page.locator('#homeBtn').click();
  await page.reload(); // the stats are saved
  const day = await page.evaluate(() => stats.days[today()]);
  expect(day).toMatchObject({ r: 1, q: 2, c: 1, n: 1 });
  expect(day.t).toBeGreaterThan(0);
  const saved = await page.evaluate(() => [localStorage.getItem(STORE_KEY), decodeURIComponent(document.cookie)]);
  for (const s of saved) expect(s).not.toContain('"facts"');
  await page.locator('#cashoutBtn').click();
  const box = page.locator('#grownStats');
  await expect(page.locator('#statsBody')).toBeHidden();
  await box.locator('summary').click();
  await expect(page.locator('#statsBody')).toContainText('50%right first time (30 days)');
  await expect(page.locator('#statsBody')).toContainText('Day by day');
  // Under the coins and the trade-in totals
  const [statsTop, bankTop] = await Promise.all(['#grownStats', '#cashBank'].map(s => page.locator(s).boundingBox().then(b => b.y)));
  expect(statsTop).toBeGreaterThan(bankTop);
});

test('stats come back from IndexedDB, add up with another tab, and keep two years', async ({ page }) => {
  await page.evaluate(() => { logStat('r', 3); stats.days[today() - STATS_DAYS_KEPT - 1] = { r: 1 }; saveState(); });
  expect(await page.evaluate(() => stats.days[today() - STATS_DAYS_KEPT - 1])).toBeUndefined();
  await page.waitForTimeout(300);
  await page.evaluate(() => localStorage.removeItem(STATS_KEY));
  await page.reload();
  await expect.poll(() => page.evaluate(() => stats.days[today()]?.r)).toBe(3);
  // Another tab adds 2 rounds while this tab adds 1
  await page.evaluate(() => {
    const other = JSON.parse(localStorage.getItem(STATS_KEY) || JSON.stringify(statsBase));
    other.days[today()].r += 2;
    other.savedAt = Date.now() + 1000;
    localStorage.setItem(STATS_KEY, JSON.stringify(other));
    logStat('r');
    saveState();
  });
  expect(await page.evaluate(() => stats.days[today()].r)).toBe(6);
});

test('Ms. Menna says when the browser could erase her things: once in v49, then only after skipping 2 days', async ({ page }) => {
  const notice = page.locator('#keepNotice');
  // A new save has nothing to lose
  await page.evaluate(() => localStorage.removeItem(STORE_KEY + '_keepNotice'));
  expect(await page.evaluate(() => showKeepNotice())).toBe(false);
  // The first time with a save, it names the last safe day, 6 days from now
  await page.evaluate(() => { state.playDay = today(); saveState(); });
  expect(await page.evaluate(() => showKeepNotice())).toBe(true);
  const day = await page.evaluate(() => new Date(Date.now() + 6 * 864e5).toLocaleDateString('en-US', { weekday: 'long' }));
  await expect(notice).toBeVisible();
  await expect(page.locator('#keepText')).toContainText(`through next ${day}`);
  await page.locator('#keepOkBtn').click();
  await expect(notice).toBeHidden();
  // Playing yesterday, or skipping one day, is fine, and it shows once a day at most
  await page.evaluate(() => { state.playDay = today() - 1; localStorage.setItem(STORE_KEY + '_keepNotice', String(today() - 1)); });
  expect(await page.evaluate(() => showKeepNotice())).toBe(false);
  await page.evaluate(() => { state.playDay = today() - 2; localStorage.setItem(STORE_KEY + '_keepNotice', String(today() - 3)); });
  expect(await page.evaluate(() => showKeepNotice())).toBe(false);
  await page.evaluate(() => { state.playDay = today() - 3; localStorage.setItem(STORE_KEY + '_keepNotice', String(today())); });
  expect(await page.evaluate(() => showKeepNotice())).toBe(false);
  // Back after skipping 2 days
  await page.evaluate(() => localStorage.setItem(STORE_KEY + '_keepNotice', String(today() - 3)));
  expect(await page.evaluate(() => showKeepNotice())).toBe(true);
  await expect(notice).toBeVisible();
});
