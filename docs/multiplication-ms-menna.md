# Multiplication with Ms. Menna

Game-specific rules for `multiplication-ms-menna.html`. Read this before changing the game. The general rules in `CLAUDE.md` and `README.md` still apply.

## Rules that are easy to break

- The coins are exchanged for real money. Don't change the pay table, the piggy bank, or cash-outs without the user's approval, and keep the pay tests passing.
- Ms. Menna's Closet gems are separate from coins. Spending gems never touches the piggy bank.
- A sticker needs first-try right answers on separate days, one dot a day. Most facts need 3 dots (`STICKER_AT`). Facts with 0, 1 or 10, plus ÷1 and ÷10, need 2 (`EASY_DOTS`, since v46).
- Each fact order has its own sticker: 3 × 7 and 7 × 3 are two stickers, and so are 56 ÷ 7 and 56 ÷ 8 (since v25).
- A Learn with Ms. Menna round follows a fixed 10-question layout (`ROUND_SLOTS`, since v48): 3 new facts, 2 leftovers from earlier tables, 2 facts missed earlier today, 1 sneak peek and 2 reviews. Easier mode and 4-new-facts mode have their own layouts. New and leftover questions ask a fact without a sticker that can earn a dot today first, and fall back to sticker review only when none is left. The 2 review questions always ask stickers. Changes to this mix need a play-test comparison and the user's approval.
- Rooms open with stickers: Bedroom 20, Kitchen 40, Spa 60, Music 95, Playroom 121, Garden 145, Yard 171, Swimming Pool 190, Treehouse 205, Beach 221. A room that was open in an older save stays open (`oldNeed`), and an open later room opens the rooms before it.
- Starter items and treats stay buyable at any time. The toy and treat shelf sits in the House and works before the Bedroom opens.
- Don't add play limits, break prompts, countdowns, missed-day penalties, sad-pet pressure, random paid rewards or real-money purchases.

## Saves

Progress is saved in three copies, so one lost copy doesn't lose progress:

| Copy | Name | Format |
|------|------|--------|
| localStorage | `mennaMultiplication` | JSON |
| IndexedDB | database `mennaMultiplication` | JSON |
| Cookie | `mennaMult` | URL-encoded JSON in v1–v21, LZ-String compressed (`lz`) since v22 |

- `SAVE_VERSION` marks the save format. A save without it, or with a lower one, is upgraded on load and saved again in the new format.
- The cookie must stay under `COOKIE_MAX` (3,900 bytes), because browsers drop cookies over 4 KB and iPad Safari may allow only 4 KB for all of a site's cookies. Don't split the save across several cookies.
- A cookie that is too big is trimmed in steps: first the payout list is kept short in `pays`, then it is left out, then review dates and picker weights are dropped. Stickers, dots, coins, gems, items and furniture always stay. A trimmed cookie has an empty `payouts` and `partial: true`, so older versions still read it and take the payout list from IndexedDB.
- Never rename, remove or reuse a save field, item id, furniture id or room id. Furniture is stored by index, so add new pieces at the end.
- Ask the user before changing the save or cookie format.

## Tests

`tests/multiplication.spec.js` covers the pay table, piggy bank, cash-outs, stickers and dots, the learning path, division, the Closet, the House and rooms, Ms. Menna's tricks and motion, Reduce Motion, speech, and loading older saves. Tests run with speech off.

### Save-upgrade test

`upgrade-tests/` plays every released version in order, one day apart, carrying only the cookie from each version to the next. Each version must load the last cookie with nothing lost (progress, stickers, dots, piggy bank, payouts, gems, items, treats, furniture and rooms), then plays three rounds, buys things, sometimes cashes out, and saves. Finally every saved cookie is loaded on its own into the current game and checked again.

Run it before shipping any change to saving, loading, items, rooms or the economy. It takes about 15 minutes, so it's not part of the regular run:

```sh
node upgrade-tests/build-versions.js   # extracts every released version from git into upgrade-tests/vers/
npx playwright test --config upgrade-tests/playwright.config.js
```

Each version's cookie and save, plus `report.txt`, are written to `upgrade-tests/results/`. Both folders are git-ignored.

When an old cookie loads into the current game, it may show more stickers or rooms than that version had. That comes from planned upgrades, such as split fact orders and 2-dot facts. The test only fails if something goes down.
