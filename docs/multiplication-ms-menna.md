# Math with Ms. Menna

The multiplication and division game in `multiplication-ms-menna.html`. Until v50 it was called "Multiplication with Ms. Menna!"; v51 renamed it and kept the file name, so links, Home Screen icons and saves keep working. The addition and subtraction game in `ms-menna-math.html` is now "Add & Subtract with Ms. Menna!".

Game-specific rules for `multiplication-ms-menna.html`. Read this before changing the game. The general rules in `CLAUDE.md` and `README.md` still apply.

## Rules that are easy to break

- A grown-up may trade the coins for something real. Don't change the pay table, the piggy bank, or trade-ins without the user's approval, and keep the pay tests passing.
- Since v49 every amount is shown in coins, never in dollars or cents, and Cash Out is called Trade In. The save still counts them in cents (`totalCents`, `paidCents`), one cent to one coin. A trade-in can take part of the balance; the rest stays in the bank. Only the totals are kept: no new rows are added to `payouts`, and older rows stay in localStorage and IndexedDB but are no longer shown.
- Ms. Menna's Closet gems are separate from coins. Spending gems never touches the piggy bank.
- A sticker needs first-try right answers on separate days, one dot a day. Most facts need 3 dots (`STICKER_AT`). Facts with 0, 1 or 10, plus ÷1 and ÷10, need 2 (`EASY_DOTS`, since v46).
- Each fact order has its own sticker: 3 × 7 and 7 × 3 are two stickers, and so are 56 ÷ 7 and 56 ÷ 8 (since v25).
- A Learn with Ms. Menna round follows a fixed 10-question layout (`ROUND_SLOTS`, since v48): 3 new facts, 2 leftovers from earlier tables, 2 facts missed earlier today, 1 sneak peek and 2 reviews. Easier mode and 4-new-facts mode have their own layouts. New and leftover questions ask a fact without a sticker that can earn a dot today first, and fall back to sticker review only when none is left. The 2 review questions always ask stickers. Changes to this mix need a play-test comparison and the user's approval.
- Rooms open with stickers: Bedroom 20, Kitchen 40, Spa 60, Music 95, Playroom 121, Garden 145, Yard 171, Swimming Pool 190, Treehouse 205, Beach 221. A room that was open in an older save stays open (`oldNeed`), and an open later room opens the rooms before it.
- Starter items and treats stay buyable at any time. The toy and treat shelf sits in the House and works before the Bedroom opens.
- Since v50 the Toy Dino, Toy Rocket, Fire Truck and Treasure Chest are SVG pictures (`svg` and `paint` in `CLOSET`) that play with GSAP timelines in `TOY_PLAYS`. With Reduce Motion on they only fade in and out. The older emoji toys still use their CSS animations.
- Since v50 the Service Dog Vest (`offToPlay`) comes off to play, because a service dog isn't played with while working. It is off in the House and the start screen's room peek, and while she plays with a toy. It is on everywhere she teaches, and in the Closet. Only the picture changes; `state.worn` keeps it. She shows it coming off when she enters the House, and dropping on when she leaves the House for the start screen or Closet, never during a question (`swapVest`). The first time she wears it she says "When my vest is on, I'm working. Please don't pet me! I take it off to play." and the first time she enters the House in it, "Vest off. Play time!" Each is said once, remembered in localStorage (`mennaMultiplication_vestTold`, `_vestPlay`), not in the save. Only this vest does this; other suits stay on.
- Since v49 Ms. Menna tells the child the browser might erase their progress if they don't play for a week: "safe with me through next {weekday}", where the weekday is 6 days from today. It shows on the first v49 open and when she comes back after 2 or more days without play (skipping one day is fine), at most once a day, never to a new player with nothing to lose, and waits for any other greeting. The user approved the exact wording; ask before changing it.
- Since v52 the sticker chart has a ⭐ Stickers / 🌱 Garden switch. Garden shows each table (row) as one plant (`GARDEN.KINDS`): bare soil at 0 dots (since v53; v52 showed a seed), sprout at 1, almost at 2, grown when it has its sticker, and a moon badge when sleepy. In Garden mode the title, count line and help text talk about plants instead of stickers. It only changes the pictures; dots, stickers and the save are the same. The choice is kept per device in localStorage (`mennaMultiplication_chartStyle`), never in the save or cookie, and Stickers is the default. Nothing in the garden droops, wilts or shrinks, and flowers stay a minority of the plants.
- Don't add play limits, break prompts, countdowns, missed-day penalties, sad-pet pressure, random paid rewards or real-money purchases.

## Saves

Progress is saved in three copies, so one lost copy doesn't lose progress:

| Copy | Name | Format |
|------|------|--------|
| localStorage | `mennaMultiplication` | JSON |
| IndexedDB | database `mennaMultiplication` | JSON |
| Cookie | `mennaMult` | URL-encoded JSON in v1–v21, LZ-String compressed (`lz`) since v22 |

- `SAVE_VERSION` (`v`) marks the save format: 25 split shared stickers (v25), 26 easy facts at 2 dots (v46), 27 `ownBits` (v50). A save without it, or with a lower one, is upgraded on load and saved again in the new format. Older versions only check `v >=`, so a higher number is safe for them.
- The cookie must stay under `COOKIE_MAX` (3,900 bytes), because browsers drop cookies over 4 KB and iPad Safari may allow only 4 KB for all of a site's cookies. Don't split the save across several cookies.
- Since v49 the cookie always leaves out the payout list, with an empty `payouts` and `partial: true`, so older versions still read it and take the list from IndexedDB. v47 and v48 cookies may hold the list in the short `pays` form, which still loads. A cookie that is still too big drops review dates and picker weights in steps. Stickers, dots, coins, gems, items and furniture always stay.
- `id.*` (for example `party.*`) reads as an item owned in every color, but is never written. Test builds of v50 wrote it in the cookie, and an older version reading only that cookie would lose those colors when it saved. Every copy lists each color (`party.roygbpknws`).
- Since v50 every closet item and piece of furniture she owns is also kept under `mennaMultiplication_items` in localStorage and under the `items` key of the IndexedDB store, as `{ owned: [...ids], furniture: [...ids] }`. Older versions never touch it. An older version (an iPad tab left open from before an update, or a rollback) drops the items it doesn't know and saves over all three copies; on the next load this version adds them back. Nothing a child owns is ever taken away, so loading always adds the kept items in. Ids this version doesn't know stay in the list for a later version. Until the IndexedDB copy is read, saves don't write it, so it can bring back what localStorage lost. The backward test `upgrade-tests/backward.spec.js` opens a v50 save in v48 and v49, saves there, and checks v50 gets everything back.
- Since v50 every closet item added after v49 is also saved as bits in `ownBits`, in every copy. Each item in `PACK_ORDER` gets 11 bits: its classic look, then each color in `PACK_COLORS` order (`roygbpknws`). The bits are written 6 to a character, using `0-9a-zA-Z-_`, with trailing zeros dropped. The cookie's `owned` leaves these items out; the localStorage and IndexedDB copies also list them by name. Owned items are `owned` plus `ownBits`. A broken `ownBits` is ignored and never touches `owned`. Bits for items this version doesn't know, saved by a later version, are kept and written back. Only add to the end of `PACK_ORDER`, and never reorder, rename or remove an item in it or a color in `PACK_COLORS`. The test `the bit list of owned items only ever grows at the end` pins the list and fails if a new closet item is missing from it.
- A color that draws exactly like the item's classic look is not made. The five such colors that v48 and earlier sold (`OLD_SAME`: `bandana.r`, `toybox.o`, `beanbag.p`, `drum.r`, `poolfloat.k`) still exist so older saves keep them, but the shop only shows them to a child who owns one. The v50 colors in `NEAR_SAME`, which look almost like the classic look, aren't made either. Items in `PACK_ORDER` keep a bit for every color in `PACK_COLORS` even when that color isn't made (like `dinohood.g`), so bit positions never shift.
- Never rename, remove or reuse a save field, item id, furniture id or room id. Furniture is stored by index, so add new pieces at the end.
- Ask the user before changing the save or cookie format.

### Grown-up stats

Since v49, Trade In has a folded "📊 Grown-up stats" section for parents. Its day-by-day log (rounds, first-try answers, dots, stickers, reviews, answer times, pictures) and per-fact counts are kept apart from the save, under `mennaMultiplication_stats` in localStorage and under the `stats` key of the same IndexedDB store. They are never in the cookie, and older versions never read them, so the stats cannot change or lose progress. Days older than two years (`STATS_DAYS_KEPT`) are dropped. Two tabs add up their counts like the save does. Nothing in the stats may change gameplay or payouts, or be shown to the child.

## Tests

`tests/multiplication.spec.js` covers the pay table, piggy bank, trade-ins, stickers and dots, the learning path, division, the Closet, the House and rooms, Ms. Menna's tricks and motion, Reduce Motion, speech, and loading older saves. Tests run with speech off.

### Save-upgrade tests

There are two, in `upgrade-tests/`. Neither is part of the regular run.

The fast test (`cookie-fixtures`, about 5 minutes) loads the cookie each released version saved into the current game, and checks nothing was lost (progress, stickers, dots, piggy bank, payouts, gems, items, treats, furniture and rooms). Then it plays the current game for 3 days on top of the newest released cookie, and 3 days from a new save. Each day plays three rounds, buys things, trades in on one day, saves, and the next day starts from that cookie alone. Run it before shipping any change to saving, loading, items, rooms or the economy:

```sh
npx playwright test --config upgrade-tests/playwright.config.js cookie-fixtures
```

The full chain test (`cookie-chain`, about 15 minutes) plays every released version in order, one day apart, carrying only the cookie from each version to the next, with the same checks at every step. Finally every saved cookie is loaded on its own into the current game. When nothing was lost, it writes the released versions' cookies and saves to `upgrade-tests/fixtures/`, which is committed. Run it after each release, so the fast test gets the new version's cookie, and whenever the play script in `upgrade-tests/play.js` changes:

```sh
node upgrade-tests/build-versions.js   # extracts every released version from git into upgrade-tests/vers/
npx playwright test --config upgrade-tests/playwright.config.js cookie-chain
```

Each version's cookie and save, plus `report.txt`, are also written to `upgrade-tests/results/`. `vers/` and `results/` are git-ignored.

When an old cookie loads into the current game, it may show more stickers or rooms than that version had. That comes from planned upgrades, such as split fact orders and 2-dot facts. The test only fails if something goes down. Payouts are only checked for cookies that still carry the list: a cookie saved with `partial: true` (v49 and later) leaves it out on purpose, and the save is marked `partialCookie`.

The backward test (`backward`, under a minute) opens a v50 save in v48 and v49, saves there, and checks that v50 gets everything back. It needs `vers/` built.
