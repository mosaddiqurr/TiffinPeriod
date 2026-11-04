import { expect, test, type Page } from '@playwright/test';

// Phase 3 browser tests: the 3D Short-Pitch Cricket game.
// The headless browser draws WebGL in software, so the match runs faster
// (timeScale) and a small in-page driver plays the shots and bowls.

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function setup(page: Page) {
  await page.goto('./#/play/short-pitch');
  await expect(page.getByTestId('setup')).toBeVisible();
}

test('Short-Pitch 3D: the field draws, the HUD shows, a ball is bowled and pause works', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await page.getByTestId('start').click();
  await expect(page.locator('.sp-host canvas')).toBeVisible();
  await expect(page.getByTestId('sp-score')).toBeVisible();
  await expect(page.getByTestId('sp-hit')).toBeVisible();
  await expect(page.getByTestId('sp-stick')).toBeVisible();
  // One ball goes by (the batter does nothing)
  await page.waitForFunction(() => {
    const g = (window as unknown as { __shortPitch?: { state: { scores: Array<{ balls: number; runs: number }> } } }).__shortPitch;
    return !!g && (g.state.scores[0].balls >= 1 || g.state.scores[0].runs >= 1);
  }, null, { timeout: 30_000 });
  await page.getByTestId('pause').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Short-Pitch 3D: the bowler chooses a type and a spot, then bowls', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  // The computer bats first, so the player bowls.
  await page.locator('.seg').nth(4).locator('button').nth(1).click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('sp-bowl')).toBeVisible();
  await page.getByTestId('sp-type-legspin').click();
  await expect(page.getByTestId('sp-type-legspin')).toHaveAttribute('aria-pressed', 'true');
  // Tap the pitch to move the target
  const before = await page.evaluate(() => (window as unknown as { __shortPitch: { target: { x: number; y: number } } }).__shortPitch.target);
  const box = await page.locator('.sp-host canvas').boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height * 0.42);
  const after = await page.evaluate(() => (window as unknown as { __shortPitch: { target: { x: number; y: number } } }).__shortPitch.target);
  expect(after).not.toEqual(before);
  await page.getByTestId('sp-bowl').click();
  await expect(page.getByTestId('sp-bowl')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Short-Pitch 3D: a whole 1-over match reaches the report card', async ({ page, isMobile }) => {
  test.skip(isMobile);
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await setup(page);
  await page.locator('.seg').nth(2).locator('button').first().click(); // 1 over
  await page.locator('.seg').nth(3).locator('button').first().click(); // 2 wickets
  await page.getByTestId('start').click();
  await page.evaluate(() => {
    type G = { timeScale: number; phase: string; humanBowls: boolean; humanBats: boolean; t: number; p: { tContact: number } | null; press: unknown; bowl(): void; shot(k: string, a?: number): void };
    setInterval(() => {
      const g = (window as unknown as { __shortPitch?: G }).__shortPitch;
      if (!g) return;
      g.timeScale = 3;
      if (g.phase === 'pick' && g.humanBowls) g.bowl();
      if (g.phase === 'delivery' && g.humanBats && g.p && !g.press && g.t >= g.p.tContact - 0.02) g.shot('ground', Math.random() * 2 - 1);
    }, 4);
  });
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 220_000 });
  expect(errors).toEqual([]);
});
