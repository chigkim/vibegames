// Plays every released version in order, one day apart, carrying only the cookie from one version to the next.
// Each version: load the last cookie, check nothing was lost, play rounds, buy things, sometimes trade in, save the cookie.
// Then every saved cookie is loaded alone into the current game (the working copy, called "current") and checked again.
// When nothing was lost, the released versions' cookies and saves are kept in fixtures/ for the fast test.
// Setup: node upgrade-tests/build-versions.js. Run: npx playwright test --config upgrade-tests/playwright.config.js cookie-chain
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { open, snap, compare, summary, withoutPayouts, playAndSave } = require('./play');

const OUT = path.join(__dirname, 'results');
const FIXTURES = path.join(__dirname, 'fixtures');
const VERSIONS = fs.readFileSync(path.join(__dirname, 'vers/list.txt'), 'utf8').trim().split(/\r?\n/).map(l => l.split(' ')[0]).concat('current');

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
    const played = await playAndSave(page, context, day);
    ({ expected, cookie } = played);
    if (!cookie) problems.push(`${v}: no cookie saved`);
    fs.writeFileSync(path.join(OUT, `${v}.cookie`), cookie || '');
    fs.writeFileSync(path.join(OUT, `${v}.json`), JSON.stringify(expected));
    saved.push({ v, cookie, expected });
    say(`${v} ${played.note}`);
    if (errors.length) say(`${v} page errors: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }

  say('--- every saved cookie loaded alone into the current game');
  for (const s of saved) {
    const { context, page, errors } = await open(browser, 'current', s.cookie, VERSIONS.length + 3);
    const loaded = await snap(page);
    const bad = compare(s.v === 'current' ? withoutPayouts(s.expected) : s.expected, loaded);
    say(`${s.v} cookie -> current: ${bad.length ? 'LOST ' + bad.join('; ') : 'all kept'}; ${summary(loaded)}`);
    bad.forEach(b => problems.push(`${s.v} cookie -> current: ${b}`));
    if (errors.length) say(`  page errors: ${[...new Set(errors)].join(' | ')}`);
    await context.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.txt'), log.join('\n') + '\n');
  if (!problems.length) {
    const released = saved.filter(s => s.v !== 'current');
    fs.rmSync(FIXTURES, { recursive: true, force: true });
    fs.mkdirSync(FIXTURES, { recursive: true });
    for (const s of released) {
      fs.writeFileSync(path.join(FIXTURES, `${s.v}.cookie`), s.cookie);
      fs.writeFileSync(path.join(FIXTURES, `${s.v}.json`), JSON.stringify(s.expected));
    }
    fs.writeFileSync(path.join(FIXTURES, 'list.txt'), released.map(s => s.v).join('\n') + '\n');
  }
  expect(problems).toEqual([]);
});
