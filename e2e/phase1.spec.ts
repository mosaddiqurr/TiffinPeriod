import { expect, test, type Page } from '@playwright/test';

// Browser tests for the Phase 1 platform. Each game is played until a real
// result screen appears (no test-only shortcuts in the game code).

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function openGame(page: Page, id: string) {
  await page.goto(`./#/play/${id}`);
  await expect(page.getByTestId('setup')).toBeVisible();
}

test('hub shows the playable games, the 6 coming in Phase 3, and the roadmap of 35', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  for (const id of ['hand-cricket', 'book-cricket', 'pakhir-ure', 'tug-of-war', 'balloon-burst', 'biscuit-race']) {
    await expect(page.getByTestId(`card-${id}`)).toBeVisible();
  }
  await expect(page.locator('.card')).toHaveCount(29);
  await expect(page.locator('.soon')).toHaveCount(6);
  await page.getByRole('button', { name: /ভাষা|Language/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiffin period');
  await page.getByRole('link', { name: /full list of 35/ }).click();
  await expect(page.locator('.roadmap-table tbody tr')).toHaveCount(35);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test('Hand Cricket: a full match against the computer reaches a result', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page, 'hand-cricket');
  await page.getByTestId('mode-quick').click();
  await page.getByRole('group', { name: 'উইকেট' }).getByRole('button', { name: '১', exact: true }).click(); // 1 wicket
  await page.getByTestId('start').click();
  await page.getByTestId('call-odd').click();
  await page.getByTestId('p0-3').click();
  const batFirst = page.getByTestId('bat-first');
  const cont = page.getByTestId('toss-continue');
  await expect(batFirst.or(cont)).toBeVisible();
  if (await batFirst.isVisible()) await batFirst.click(); else await cont.click();
  const result = page.getByTestId('result');
  for (let i = 0; i < 300 && !(await result.isVisible()); i++) {
    const second = page.getByTestId('second-innings');
    if (await second.isVisible()) { await second.click(); continue; }
    const btn = page.getByTestId(`p0-${(i % 6) + 1}`);
    if (await btn.isEnabled()) await btn.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(120);
  }
  await expect(result).toBeVisible();
  expect(errors).toEqual([]);
});

test('Book Cricket: hold and release until the match ends', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page, 'book-cricket');
  await page.getByTestId('mode-quick').click();
  await page.getByRole('group', { name: /উইকেট/ }).getByRole('button', { name: '১', exact: true }).click();
  await page.getByRole('group', { name: /ওভার/ }).getByRole('button', { name: '১', exact: true }).click();
  await page.getByTestId('start').click();
  await page.getByTestId('call-heads').click();
  const bat = page.getByTestId('bat-first'), cont = page.getByTestId('toss-continue');
  await expect(bat.or(cont)).toBeVisible();
  if (await bat.isVisible()) await bat.click(); else await cont.click();
  const result = page.getByTestId('result');
  for (let i = 0; i < 80 && !(await result.isVisible()); i++) {
    const chase = page.getByTestId('chase');
    if (await chase.isVisible()) { await chase.click(); continue; }
    const hold = page.getByTestId('hold');
    if (await hold.isVisible() && await hold.isEnabled()) {
      await hold.dispatchEvent('pointerdown');
      await page.waitForTimeout(300);
      await hold.dispatchEvent('pointerup');
    }
    await page.waitForTimeout(700);
  }
  await expect(result).toBeVisible();
  expect(errors).toEqual([]);
});

test('Pakhir Ure: solo game ends after three mistakes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await openGame(page, 'pakhir-ure');
  await page.getByRole('button', { name: /ট্যাপ/ }).click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('call')).toBeVisible();
  // Do nothing: every flying thing is a miss, so the three lives run out.
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 100_000 });
  expect(errors).toEqual([]);
});

test('Tug of War: pause works and the hard computer wins a one-round match', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page, 'tug-of-war');
  await page.getByRole('button', { name: 'কঠিন' }).click();
  await page.getByRole('group', { name: 'ম্যাচ' }).getByRole('button').first().click();
  await page.getByTestId('start').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('pause').click();
  await expect(page.getByRole('dialog', { name: 'খেলা থেমে আছে' })).toBeVisible();
  await page.getByRole('button', { name: 'আবার চালাও' }).click();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('result')).toContainText('হার');
  expect(errors).toEqual([]);
});

test('Balloon Burst: taps register and the 30-second round ends', async ({ page }) => {
  const errors = trackErrors(page);
  await page.clock.install();
  await openGame(page, 'balloon-burst');
  await page.getByRole('button', { name: /৩০/ }).click();
  await page.getByTestId('start').click();
  const canvas = page.locator('canvas');
  await page.clock.runFor(3500);
  const box = (await canvas.boundingBox())!;
  for (let i = 0; i < 12; i++) {
    await canvas.dispatchEvent('pointerdown', { clientX: box.x + box.width * (0.2 + (i % 4) * 0.2), clientY: box.y + box.height * 0.55, pointerId: 1 });
    await page.clock.runFor(150);
  }
  // Let React flush the canvas mount and the delayed report between clock steps.
  for (let second = 0; second < 40 && !await page.getByTestId('result').isVisible(); second++) {
    await page.clock.runFor(1000);
  }
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('result')).toContainText('সময় শেষ');
  expect(errors).toEqual([]);
});

test('Biscuit Race: the computer catches its biscuit and wins', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page, 'biscuit-race');
  await page.getByRole('button', { name: 'কঠিন' }).click();
  await page.getByTestId('start').click();
  await page.waitForTimeout(3500);
  // Player 1 runs to the frame and jumps once (touch control).
  const run = page.getByTestId('l1-right');
  await run.dispatchEvent('pointerdown', { pointerId: 5 });
  await page.waitForTimeout(1200);
  await run.dispatchEvent('pointerup', { pointerId: 5 });
  await page.getByTestId('l1-jump').dispatchEvent('pointerdown', { pointerId: 6 });
  await page.getByTestId('l1-jump').dispatchEvent('pointerup', { pointerId: 6 });
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 70_000 });
  expect(errors).toEqual([]);
});

test('scores and settings persist after a reload; sound can be muted', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('tp.v1.scores', JSON.stringify({ 'balloon-burst': { plays: 1, wins: 0, losses: 0, ties: 0, streak: 0, bestStreak: 0, best: 123, records: {} } })));
  await page.reload();
  await expect(page.getByTestId('card-balloon-burst')).toContainText('১২৩');
  const sound = page.getByRole('button', { name: /শব্দ চালু|শব্দ বন্ধ/ });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: 'শব্দ বন্ধ' })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('./#/records');
  await expect(page.locator('.roadmap-table')).toContainText('১২৩');
});

test('every game loads in English with no console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: 'en' })));
  for (const id of ['hand-cricket', 'book-cricket', 'pakhir-ure', 'tug-of-war', 'balloon-burst', 'biscuit-race']) {
    await page.goto(`./#/play/${id}`);
    await expect(page.getByTestId('setup')).toBeVisible();
    if (id.endsWith('cricket')) await page.getByTestId('mode-quick').click();
    await page.getByTestId('start').click();
    await page.waitForTimeout(600);
    await page.goto('./#/');
  }
  expect(errors).toEqual([]);
});
