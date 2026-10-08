// The fast save-upgrade test, about 5 minutes instead of 15. It uses the cookies each released version saved in the
// full chain test (fixtures/, oldest first in list.txt), so the old versions don't have to be played again.
// Then it plays the current game like a child and reopens it from its own cookie alone.
// Run: npx playwright test --config upgrade-tests/playwright.config.js cookie-fixtures
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { open, snap, compare, summary, withoutPayouts, playAndSave } = require('./play');

const FIXTURES = path.join(__dirname, 'fixtures');
const NAMES = fs.readFileSync(path.join(FIXTURES, 'list.txt'), 'utf8').trim().split(/\r?\n/);
const fixture = v => ({
  v,
  cookie: fs.readFileSync(path.join(FIXTURES, `${v}.cookie`), 'utf8'),
  expected: JSON.parse(fs.readFileSync(path.join(FIXTURES, `${v}.json`), 'utf8')),
});
// The day each fixture was saved is its place in the list, so the current game always plays on later days.
const TODAY = NAMES.length;

test('every released version\'s cookie loads alone into the current game with nothing lost', async ({ browser }) => {
  const problems = [];
  for (const s of NAMES.map(fixture)) {
    const { context, page, errors } = await open(browser, 'current', s.cookie, TODAY);
    const bad = compare(s.expected, await snap(page));
    console.log(`${s.v} cookie -> current: ${bad.length ? 'LOST ' + bad.join('; ') : 'all kept'}`);
    bad.forEach(b => problems.push(`${s.v} cookie -> current: ${b}`));
    if (errors.length) problems.push(`${s.v} cookie -> current: page errors ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }
  expect(problems).toEqual([]);
});

// Plays the current game for `days` days, each day starting from the last day's cookie alone, and checks that each
// cookie brings back everything the day before saved.
async function playDays(browser, first, days) {
  const problems = [];
  let { cookie, expected } = first;
  for (let i = 0; i < days; i++) {
    const day = TODAY + i;
    const { context, page, errors } = await open(browser, 'current', cookie, day);
    const loaded = await snap(page);
    if (expected) {
      const bad = compare(i ? withoutPayouts(expected) : expected, loaded);
      bad.forEach(b => problems.push(`day ${i + 1} load: ${b}`));
    }
    const played = await playAndSave(page, context, day);
    console.log(`day ${i + 1} ${played.note}`);
    if (!played.answered) problems.push(`day ${i + 1}: no questions answered`);
    if (!played.cookie) problems.push(`day ${i + 1}: no cookie saved`);
    const before = loaded.state;
    const after = played.expected.state;
    if (after.totalCents + after.paidCents <= before.totalCents + (before.paidCents || 0)) problems.push(`day ${i + 1}: earned no coins`);
    if (errors.length) problems.push(`day ${i + 1}: page errors ${[...new Set(errors)].join(' | ')}`);
    ({ cookie, expected } = played);
    await context.close();
  }
  // The last day's cookie alone, on the next day
  const { context, page, errors } = await open(browser, 'current', cookie, TODAY + days);
  const loaded = await snap(page);
  compare(withoutPayouts(expected), loaded).forEach(b => problems.push(`last cookie load: ${b}`));
  if (errors.length) problems.push(`last cookie load: page errors ${[...new Set(errors)].join(' | ')}`);
  console.log(`last cookie -> current: ${summary(loaded)}`);
  await context.close();
  return problems;
}

test('the current game plays on the newest released cookie for 3 days, trades in, and its own cookie loads with nothing lost', async ({ browser }) => {
  expect(await playDays(browser, fixture(NAMES.at(-1)), 3)).toEqual([]);
});

test('a new player\'s save in the current game loads from its cookie alone', async ({ browser }) => {
  expect(await playDays(browser, { cookie: null, expected: null }, 3)).toEqual([]);
});
