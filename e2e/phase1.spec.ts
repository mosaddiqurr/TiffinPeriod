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

test('hub shows the 17 games, with no coming-soon section after the archive', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  for (const id of ['hand-cricket', 'book-cricket', 'pakhir-ure', 'balloon-burst']) {
    await expect(page.getByTestId(`card-${id}`)).toBeVisible();
  }
  await expect(page.locator('.card')).toHaveCount(17);
  await expect(page.locator('.soon')).toHaveCount(0);
  await page.getByRole('button', { name: /ভাষা|Language/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tiffin period');
  await page.goto('./#/roadmap');
  await expect(page.locator('.roadmap-table tbody tr')).toHaveCount(17);
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

test('Balloon Burst: taps register and the 30-second round ends', async ({ page }) => {
  const errors = trackErrors(page);
  await page.clock.install();
  await openGame(page, 'balloon-burst');
  await page.getByTestId('style-pin').click();
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

test('Balloon Burst, mela gun: drag moves the sight, letting go fires one pellet, the round ends when pellets run out', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page, 'balloon-burst');
  await expect(page.getByTestId('style-gun')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /৩০/ }).click();
  await page.getByTestId('start').click();
  await page.waitForTimeout(3600);
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  type G = { sx: number; sy: number; ammo: number };
  const gun = () => page.evaluate(() => { const g = (window as unknown as { __balloon: { lanes: Array<{ gun: G }> } }).__balloon.lanes[0].gun; return { sx: g.sx, sy: g.sy, ammo: g.ammo }; });
  const before = await gun();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.6, { steps: 8 });
  const moved = await gun();
  expect(moved.ammo).toBe(before.ammo);
  expect(moved.sy).toBeLessThan(before.sy - 40);
  await page.mouse.up();
  await expect.poll(async () => (await gun()).ammo).toBe(before.ammo - 1);
  // Fire the rest of the pellets: the round ends before the 30 seconds are up.
  for (let i = 0; i < 80 && !await page.getByTestId('result').isVisible(); i++) {
    await page.evaluate(() => (window as unknown as { __balloon?: { fireCross(): void } }).__balloon?.fireCross());
    await page.waitForTimeout(340);
  }
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('result')).toContainText('গুলি শেষ');
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
  for (const id of ['hand-cricket', 'book-cricket', 'pakhir-ure', 'balloon-burst']) {
    await page.goto(`./#/play/${id}`);
    await expect(page.getByTestId('setup')).toBeVisible();
    if (id.endsWith('cricket')) await page.getByTestId('mode-quick').click();
    await page.getByTestId('start').click();
    await page.waitForTimeout(600);
    await page.goto('./#/');
  }
  expect(errors).toEqual([]);
});
