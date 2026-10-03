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
