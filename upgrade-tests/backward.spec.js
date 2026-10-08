// A v50 save opened by an older page (v48, v49), which saves, then v50 opens again.
const { test, expect } = require('@playwright/test');
const { open } = require('./play');

const OLD = ['v48', 'v49'];

async function v50Save(browser) {
  const { context, page } = await open(browser, 'current', null, 0);
  const owned = await page.evaluate(() => {
    state.gems = 77;
    state.owned = Object.keys(ITEMS).filter(id => ITEMS[id].price > 0);
    saveState();
    return state.owned.slice();
  });
  await page.waitForTimeout(500); // let IndexedDB finish
  const storage = await context.storageState();
  await context.close();
  return { owned, storage };
}

const ownedOf = page => page.evaluate(() => state.owned.slice());

test('older pages open a v50 save, save it, and v50 opens again', async ({ browser }) => {
  const { owned, storage } = await v50Save(browser);
  const cookie = storage.cookies.find(c => c.name === 'mennaMult').value;
  let OLD_IDS;
  const report = [], problems = [];
  for (const v of OLD) {
    for (const mode of ['all copies', 'cookie only']) {
      // An old page opens the v50 save. With all copies, IndexedDB is rebuilt by the v50 page first.
      const ctx = await browser.newContext(mode === 'all copies' ? { storageState: storage } : {});
      await ctx.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }));
      if (mode === 'cookie only') await ctx.addCookies([{ name: 'mennaMult', value: cookie, domain: 'localhost', path: '/' }]);
      if (mode === 'all copies') {
        const p = await ctx.newPage();
        await p.goto('/multiplication-ms-menna.html');
        await p.waitForTimeout(800);
        await p.close();
      }
      const p1 = await ctx.newPage();
      await p1.goto(`/upgrade-tests/vers/${v}/multiplication-ms-menna.html`);
      await p1.waitForTimeout(1200);
      OLD_IDS = new Set(await p1.evaluate(() => Object.keys(ITEMS)));
      const oldSees = await ownedOf(p1);
      const oldKnows = owned.filter(id => OLD_IDS.has(id));
      const missingInOld = oldKnows.filter(id => !oldSees.includes(id));
      await p1.evaluate(() => { state.gems += 1; saveState(); }); // the old page saves after play
      await p1.waitForTimeout(800);
      await p1.close();
      // v50 opens again.
      const p2 = await ctx.newPage();
      await p2.goto('/multiplication-ms-menna.html');
      await p2.waitForTimeout(1500);
      const back = await ownedOf(p2);
      const gems = await p2.evaluate(() => state.gems);
      const lost = owned.filter(id => !back.includes(id));
      const lostNew = lost.filter(id => !OLD_IDS.has(id)), lostOld = lost.filter(id => OLD_IDS.has(id));
      report.push(`${v}, ${mode}: old page missed ${missingInOld.length}/${oldKnows.length} old items; ` +
        `v50 after: lost ${lostOld.length} old items, ${lostNew.length}/${owned.length - oldKnows.length} v50 items, gems ${gems}` +
        (lost.length ? ` e.g. ${lost.slice(0, 4).join(',')}` : ''));
      // From the cookie alone, an older page never had the v50 items to give back. Everything else must stay.
      if (lostOld.length || (mode === 'all copies' && lostNew.length) || gems !== 78) problems.push(report[report.length - 1]);
      await ctx.close();
    }
  }
  console.log('BACKWARD\n' + report.join('\n'));
  expect(problems).toEqual([]);
});
