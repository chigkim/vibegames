// Plays every released version in order, one day apart, carrying only the cookie from one version to the next.
// Each version: load the last cookie, check nothing was lost, play rounds, buy things, sometimes cash out, save the cookie.
// Then every saved cookie is loaded alone into the current game (the working copy, called "current") and checked again.
// Setup: node upgrade-tests/build-versions.js. Run: npx playwright test --config upgrade-tests/playwright.config.js
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const OUT = path.join(__dirname, 'results');
const VERSIONS = fs.readFileSync(path.join(__dirname, 'vers/list.txt'), 'utf8').trim().split(/\r?\n/).map(l => l.split(' ')[0]).concat('current');
const urlOf = v => v === 'current' ? '/multiplication-ms-menna.html' : `/upgrade-tests/vers/${v}/multiplication-ms-menna.html`;
const DAY = 86400000;
const BASE = Date.UTC(2026, 7, 1, 14); // 10 am EDT
const ROUNDS = 3;

async function open(browser, v, cookie, day) {
  const context = await browser.newContext();
  await context.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }));
  await context.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  if (cookie) await context.addCookies([{ name: 'mennaMult', value: cookie, domain: 'localhost', path: '/' }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: BASE + day * DAY });
  await page.goto(urlOf(v));
  await page.clock.runFor(1500);
  return { context, page, errors };
}

const snap = page => page.evaluate(() => ({
  state: JSON.parse(JSON.stringify(state)),
  keys: typeof FACT_KEYS === 'undefined' ? [] : FACT_KEYS.slice(),
  stickerAt: typeof STICKER_AT === 'undefined' ? 0 : STICKER_AT,
}));

// One round on the learning path (or table 10 before there was a path), every answer right.
async function playRound(page) {
  await page.evaluate(() => {
    const src = startRound.toString();
    if (/^function startRound\(path/.test(src)) startRound('main');
    else if (/path = false/.test(src)) startRound(MAX_NUMBER, true);
    else startRound(Math.min(10, MAX_NUMBER));
  });
  let answered = 0;
  for (let i = 0; i < 100; i++) {
    const s = await page.evaluate(() => {
      if (!document.querySelector('#gameScreen.active')) return 'done';
      if (game.locked || game.input) return 'wait';
      game.input = String(typeof answerOf === 'function' ? answerOf(game) : game.a * game.b);
      submitAnswer();
      return 'answered';
    });
    if (s === 'done') break;
    if (s === 'answered') answered++;
    await page.clock.runFor(1500);
  }
  await page.clock.runFor(3000);
  return answered;
}

// Buys the cheapest closet item, treat and furniture piece she can afford, if any.
const shop = page => page.evaluate(() => {
  const got = [];
  const has = (list, id) => (list || []).includes(id);
  const cheapest = list => list.sort((a, b) => a.price - b.price)[0];
  if (typeof ITEMS !== 'undefined' && typeof buyItem === 'function') {
    const it = cheapest(Object.values(ITEMS).filter(i => i.price > 0 && i.slot && !has(state.owned, i.id) && i.price <= state.gems));
    if (it) { tryingOn = it.id; buyItem(); if (has(state.owned, it.id)) got.push(it.id); }
  }
  if (typeof TREAT !== 'undefined' && typeof buyTreat === 'function') {
    const t = cheapest(Object.values(TREAT).filter(t => t.price <= state.gems && (state.treats[t.id] || 0) < MAX_TREATS));
    if (t) { const n = state.treats[t.id] || 0; treatPick = t.id; buyTreat(); if ((state.treats[t.id] || 0) > n) got.push('treat:' + t.id); }
  }
  if (typeof FURN !== 'undefined' && typeof buyFurniture === 'function') {
    const open = f => {
      const id = f.room || (FURN[f.base] || {}).room;
      const r = ROOMS.find(r => r.id === id);
      if (!r) return true;
      return typeof roomOpen === 'function' ? roomOpen(r) : r.need <= (typeof stickerCount === 'function' ? stickerCount() : 0);
    };
    const p = cheapest(Object.values(FURN).filter(f => f.base && f.price > 0 && !has(state.furniture, f.id) && f.price <= state.gems && open(f)));
    if (p) { houseTrying = p.id; buyFurniture(); if (has(state.furniture, p.id)) got.push('furn:' + p.id); }
  }
  return got;
});

// Cashes out the piggy bank the way each version asks: tap twice before v16, tap then Yes after.
async function pay(page) {
  const amount = await page.evaluate(() => {
    if (typeof onPayTap !== 'function' || state.totalCents <= 0) return 0;
    const amount = state.totalCents;
    onPayTap();
    if (typeof onPayYes !== 'function') onPayTap();
    return amount;
  });
  if (!amount) return 0;
  await page.clock.runFor(3000);
  await page.evaluate(() => { if (typeof onPayYes === 'function') onPayYes(); });
  await page.clock.runFor(1000);
  return amount;
}

// Everything in `exp` (a save as one version left it) must still be in `got` (as another version loaded it).
function compare(exp, got) {
  const bad = [];
  const e = exp.state;
  const g = got.state;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of ['totalCents', 'paidCents', 'gems']) if (k in e && e[k] !== g[k]) bad.push(`${k} ${e[k]} -> ${g[k]}`);
  if (e.payouts && !same(e.payouts, (g.payouts || []).slice(0, e.payouts.length))) bad.push(`payouts ${JSON.stringify(e.payouts)} -> ${JSON.stringify(g.payouts)}`);
  for (const k of ['owned', 'furniture', 'rooms']) {
    const lost = (e[k] || []).filter(id => !(g[k] || []).includes(id));
    if (lost.length) bad.push(`${k} lost ${lost.join(',')}`);
  }
  for (const k of ['worn', 'toys', 'home', 'treats']) {
    for (const [slot, val] of Object.entries(e[k] || {})) if (!same((g[k] || {})[slot], val)) bad.push(`${k}.${slot} ${val} -> ${(g[k] || {})[slot]}`);
  }
  if (e.mastery) {
    const gi = new Map(got.keys.map((k, i) => [k, i]));
    exp.keys.forEach((key, i) => {
      const was = e.mastery[i] || 0;
      if (!was) return;
      if (!gi.has(key)) bad.push(`fact ${key} missing`);
      else if ((g.mastery[gi.get(key)] || 0) < was) bad.push(`fact ${key} dots ${was} -> ${g.mastery[gi.get(key)]}`);
    });
  }
  return bad;
}

const summary = s => {
  const st = s.state;
  const stickers = (st.mastery || []).filter(m => s.stickerAt && m >= s.stickerAt).length;
  const dots = (st.mastery || []).reduce((a, m) => a + Math.min(m, s.stickerAt || m), 0);
  const treats = Object.values(st.treats || {}).reduce((a, n) => a + n, 0);
  return `bank ${st.totalCents}¢ paid ${st.paidCents ?? '-'}¢ payouts ${(st.payouts || []).length} gems ${st.gems ?? '-'} stickers ${stickers} dots ${dots} ` +
    `items ${(st.owned || []).length} treats ${treats} furniture ${(st.furniture || []).length} rooms ${(st.rooms || []).length}`;
};

test('every version keeps the progress, items, gems and piggy bank in the cookie it was given', async ({ browser }) => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const log = [];
  const say = line => { log.push(line); console.log(line); };
  const problems = [];
  const saved = [];
  let cookie = null;
  let expected = null;

  for (const [day, v] of VERSIONS.entries()) {
    const { context, page, errors } = await open(browser, v, cookie, day);
    if (expected) {
      const loaded = await snap(page);
      const bad = compare(expected, loaded);
      say(`${v} loaded ${saved.at(-1).v} cookie: ${bad.length ? 'LOST ' + bad.join('; ') : 'all kept'}`);
      bad.forEach(b => problems.push(`${saved.at(-1).v} -> ${v}: ${b}`));
    }
    let answered = 0;
    for (let r = 0; r < ROUNDS; r++) answered += await playRound(page);
    const bought = await shop(page);
    const paid = day % 3 === 2 ? await pay(page) : 0;
    await page.evaluate(() => saveState());
    await page.clock.runFor(1000);
    expected = await snap(page);
    cookie = (await context.cookies()).find(c => c.name === 'mennaMult')?.value || null;
    if (!cookie) problems.push(`${v}: no cookie saved`);
    fs.writeFileSync(path.join(OUT, `${v}.cookie`), cookie || '');
    fs.writeFileSync(path.join(OUT, `${v}.json`), JSON.stringify(expected));
    saved.push({ v, cookie, expected });
    say(`${v} played ${answered} answers, bought ${bought.join(' ') || 'nothing'}${paid ? `, paid ${paid}¢` : ''}; ${summary(expected)}; cookie ${(cookie || '').length} bytes`);
    if (errors.length) say(`${v} page errors: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }

  say('--- every saved cookie loaded alone into the current game');
  for (const s of saved) {
    const { context, page, errors } = await open(browser, 'current', s.cookie, VERSIONS.length + 3);
    const loaded = await snap(page);
    const bad = compare(s.expected, loaded);
    say(`${s.v} cookie -> current: ${bad.length ? 'LOST ' + bad.join('; ') : 'all kept'}; ${summary(loaded)}`);
    bad.forEach(b => problems.push(`${s.v} cookie -> current: ${b}`));
    if (errors.length) say(`  page errors: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.txt'), log.join('\n') + '\n');
  expect(problems).toEqual([]);
});
