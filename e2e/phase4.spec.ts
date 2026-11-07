import { expect, test, type Page } from '@playwright/test';

// Browser tests for the national-team modes and the seven new games.
// Canvas games are driven through small test hooks on window (__flikk, __pk, __five, __eraser)
// after one real drag gesture, so the tests finish in reasonable time.

declare global {
  interface Window {
    __flikk?: { w: { bodies: Array<{ id: number; kind: string; side: number; x: number; y: number }> }; testFlick(a: number, p: number, id?: number): boolean };
    __pk?: { testShoot(x: number, y: number, p: number): boolean; testDive(x: number, y: number): boolean };
    __five?: { testPerfect(): boolean };
    __eraser?: { w: { erasers: Array<{ x: number; y: number }> }; testFlick(a: number, p: number): boolean };
  }
}

const NEW = ['number-cricket', 'flikk-football', 'penalty', 'five-stones', 'dots-boxes', 'hangman', 'eraser-flip'];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function open(page: Page, id: string, lang = 'en') {
  await page.addInitScript((l) => { if (!localStorage.getItem('tp.v1.settings')) localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: l, sound: false })); }, lang);
  await page.goto(`./#/play/${id}`);
  await expect(page.getByTestId('setup')).toBeVisible();
}

async function loop(page: Page, step: () => Promise<void>, ms = 120_000) {
  const result = page.getByTestId('result');
  const until = Date.now() + ms;
  while (Date.now() < until && !(await result.isVisible())) { await step(); await page.waitForTimeout(250); }
  await expect(result).toBeVisible();
}

const clickIf = async (page: Page, id: string) => { const b = page.getByTestId(id); if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => {}); };

test('hub shows the seven new games and every new setup fits the screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  for (const id of NEW) await expect(page.getByTestId(`card-${id}`)).toBeVisible();
  for (const lang of ['en', 'bn']) {
    await page.evaluate((l) => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: l, sound: false })), lang);
    for (const id of NEW) {
      await page.goto(`./#/play/${id}`);
      await page.reload();
      await expect(page.getByTestId('setup')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  }
  expect(errors).toEqual([]);
});

test('Hand Cricket: Target Challenge level 1 shows the chase and reaches a result', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'hand-cricket');
  await page.getByTestId('mode-challenge').click();
  await page.getByTestId('level-1').click();
  await expect(page.getByTestId('chase-hud')).toContainText('Need 12');
  let i = 0;
  await loop(page, async () => { const b = page.getByTestId(`p0-${(i++ % 6) + 1}`); if (await b.isEnabled()) await b.click({ timeout: 1500 }).catch(() => {}); });
  await expect(page.getByTestId('after-retry')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Hand Cricket: a tournament match updates the cup board', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await open(page, 'hand-cricket');
  await page.getByTestId('mode-cup').click();
  await page.getByTestId('cup-start').click();
  await page.getByTestId('cup-play').click();
  let i = 0;
  await loop(page, async () => {
    await clickIf(page, 'call-odd'); await clickIf(page, 'bat-first'); await clickIf(page, 'toss-continue'); await clickIf(page, 'second-innings');
    const b = page.getByTestId(`p0-${(i++ % 6) + 1}`); if (await b.isEnabled().catch(() => false)) await b.click({ timeout: 1500 }).catch(() => {});
  }, 160_000);
  await page.getByTestId('after-next').click();
  await expect(page.locator('.cup-fixtures li').first()).toContainText(/Won|Lost|Tied/);
  expect(errors).toEqual([]);
});

test('Number Cricket: quick match to a result', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await open(page, 'number-cricket');
  await page.getByTestId('mode-quick').click();
  await page.getByRole('group', { name: 'Wickets' }).getByRole('button', { name: '1', exact: true }).click();
  await page.getByTestId('start').click();
  let i = 0;
  await loop(page, async () => {
    await clickIf(page, 'call-heads'); await clickIf(page, 'bat-first'); await clickIf(page, 'toss-continue'); await clickIf(page, 'second-innings');
    const b = page.getByTestId(`p0-${i++ % 7}`); if (await b.isEnabled().catch(() => false)) await b.click({ timeout: 1500 }).catch(() => {});
  }, 160_000);
  expect(errors).toEqual([]);
});

test('Book Cricket: the Daily Challenge saves a score', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'book-cricket');
  await page.getByTestId('mode-daily').click();
  await page.getByTestId('daily-play').click();
  await loop(page, async () => {
    const hold = page.getByTestId('hold');
    if (await hold.isEnabled().catch(() => false)) { await hold.dispatchEvent('pointerdown'); await page.waitForTimeout(250); await hold.dispatchEvent('pointerup'); await page.waitForTimeout(900); }
  });
  await expect(page.getByTestId('result')).toContainText('Daily score');
  await page.getByRole('button', { name: 'Daily board' }).click();
  await expect(page.locator('.daily-stats')).not.toContainText('Best today —');
  expect(errors).toEqual([]);
});

test('Flikk Football (roaming players): a real drag flicks a piece, and a quick match finishes', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await open(page, 'flikk-football');
  await page.getByTestId('style-free').click();
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('form-4-4-2').click();
  await page.getByTestId('start').click();
  await page.waitForTimeout(2200);
  // Drag back from the kicker (just below the centre spot) and let go.
  const box = (await page.locator('.ff-canvas canvas').boundingBox())!;
  const scale = Math.min(box.width / 600, box.height / 960);
  const ox = box.x + (box.width - 600 * scale) / 2, oy = box.y + (box.height - 960 * scale) / 2;
  const kicker = await page.evaluate(() => { const s = window.__flikk!; const b = s.w.bodies.find((x) => x.kind === 'ball')!; return s.w.bodies.filter((x) => x.kind === 'disc' && x.side === 0).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0]; });
  await page.mouse.move(ox + kicker.x * scale, oy + kicker.y * scale);
  await page.mouse.down();
  await page.mouse.move(ox + kicker.x * scale, oy + (kicker.y + 120) * scale, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => { const b = window.__flikk!.w.bodies.find((x) => x.kind === 'ball')!; return Math.round(b.y); }), { timeout: 8000 }).toBeLessThan(470);
  await loop(page, async () => {
    await page.evaluate(() => {
      const s = window.__flikk; if (!s) return;
      const b = s.w.bodies.find((x) => x.kind === 'ball')!;
      const m = s.w.bodies.filter((x) => x.kind === 'disc' && x.side === 0).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
      const gx = 300 - b.x, gy = 40 - b.y, l = Math.hypot(gx, gy);
      s.testFlick(Math.atan2(b.y - (gy / l) * 28 - m.y, b.x - (gx / l) * 28 - m.x), 0.85, m.id);
    });
  }, 220_000);
  expect(errors).toEqual([]);
});

test('Flikk Football (fixed players): pull back anywhere to flick the ball, players stay put, a match finishes', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await open(page, 'flikk-football');
  await expect(page.getByTestId('style-fixed')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('chain')).toBeVisible();
  await expect(page.getByTestId('regroup')).toHaveCount(0);
  await page.waitForTimeout(2200);
  const spots = () => page.evaluate(() => window.__flikk!.w.bodies.filter((x) => x.kind === 'disc').map((x) => `${x.x.toFixed(1)},${x.y.toFixed(1)}`).join(' '));
  const before = await spots();
  // Press in empty space below the ball, pull further down and let go: the ball goes up the pitch.
  const box = (await page.locator('.ff-canvas canvas').boundingBox())!;
  const scale = Math.min(box.width / 600, box.height / 960);
  const ox = box.x + (box.width - 600 * scale) / 2, oy = box.y + (box.height - 960 * scale) / 2;
  await page.mouse.move(ox + 560 * scale, oy + 700 * scale);
  await page.mouse.down();
  await page.mouse.move(ox + 560 * scale, oy + 790 * scale, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Math.round(window.__flikk!.w.bodies.find((x) => x.kind === 'ball')!.y)), { timeout: 8000 }).toBeLessThan(440);
  await page.waitForTimeout(3000);
  expect(await spots()).toBe(before);
  await loop(page, async () => {
    await page.evaluate(() => {
      const s = window.__flikk; if (!s) return;
      const b = s.w.bodies.find((x) => x.kind === 'ball')!;
      s.testFlick(Math.atan2(40 - b.y, 300 - b.x) + (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.4);
    });
  }, 220_000);
  expect(errors).toEqual([]);
});

test('Hand Cricket online: quick match finds an opponent and a whole match is played', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await open(page, 'hand-cricket');
  await page.getByTestId('mode-online').click();
  await page.getByTestId('online-name').fill('Tester');
  await page.getByTestId('quick-match').click();
  await expect(page.getByTestId('searching')).toBeVisible();
  await expect(page.getByTestId('found')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('online-match')).toBeVisible({ timeout: 5_000 });
  const result = page.getByTestId('result');
  for (let i = 0; i < 150 && !(await result.isVisible()); i++) {
    for (const id of ['call-odd', 'bat-first']) { const x = page.getByTestId(id); if (await x.isVisible().catch(() => false)) await x.click().catch(() => {}); }
    const k = page.getByTestId(`p0-${(i % 6) + 1}`);
    if (await k.isEnabled().catch(() => false)) await k.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await expect(result).toBeVisible();
  await expect(page.getByTestId('rematch')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Hand Cricket online: a room has a 5-character code and a bad code is explained', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'hand-cricket');
  await page.getByTestId('mode-online').click();
  await page.getByTestId('create-room').click();
  await expect(page.getByTestId('room-code')).toHaveAttribute('aria-label', /^[2-9A-HJKMNP-Z]{5}$/, { timeout: 15_000 });
  await page.getByTestId('cancel').click();
  await page.getByTestId('join-code').fill('zz zz2');
  await expect(page.getByTestId('join-code')).toHaveValue('ZZZZ2');
  await page.getByTestId('join-room').click();
  await expect(page.getByTestId('online-error')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('Penalty Shootout: shoot and keep through a full shootout', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await open(page, 'penalty');
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('start').click();
  await loop(page, async () => { await page.evaluate(() => { const s = window.__pk; if (!s) return; s.testShoot(Math.random() < 0.5 ? -0.75 : 0.75, 0.7, 0.7); s.testDive(Math.random() < 0.5 ? -0.6 : 0.6, 0.4); }); }, 140_000);
  expect(errors).toEqual([]);
});

test('Five Stones: solo run through all five stages', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'five-stones');
  await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Solo' }).click();
  await page.getByTestId('start').click();
  await loop(page, async () => { await page.evaluate(() => window.__five?.testPerfect()); await page.waitForTimeout(500); });
  await expect(page.getByTestId('result')).toContainText('All five stages');
  expect(errors).toEqual([]);
});

test('Dots and Boxes: a full game against the computer', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'dots-boxes');
  await page.getByRole('button', { name: '3×3' }).click();
  await page.getByTestId('start').click();
  await loop(page, async () => {
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=line-]')].map((e) => e.getAttribute('data-testid')!));
    if (ids.length) await page.getByTestId(ids[Math.floor(Math.random() * ids.length)]).click({ timeout: 1500 }).catch(() => {});
  });
  expect(errors).toEqual([]);
});

test('Hangman: Bangla keyboard and a five-word round', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'hangman', 'bn');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('key-ক')).toBeVisible();
  await loop(page, async () => {
    if (await page.getByTestId('next-word').isVisible()) { await page.getByTestId('next-word').click(); return; }
    const keys = await page.evaluate(() => [...document.querySelectorAll('[data-testid^=key-]:not([disabled])')].map((e) => e.getAttribute('data-testid')!));
    if (keys.length) await page.getByTestId(keys[Math.floor(Math.random() * keys.length)]).click({ timeout: 1500 }).catch(() => {});
  });
  expect(errors).toEqual([]);
});

test('Eraser Flip: a challenge level and a duel', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await open(page, 'eraser-flip');
  await page.getByTestId('level-2').click();
  await page.getByTestId('start').click();
  await loop(page, async () => { await page.evaluate(() => window.__eraser?.testFlick(-Math.PI / 2, 0.5 + Math.random() * 0.15)); await page.waitForTimeout(400); });
  await page.getByRole('button', { name: 'Change setup' }).click();
  await page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'vs Computer' }).click();
  await page.getByTestId('start').click();
  await loop(page, async () => { await page.evaluate(() => { const s = window.__eraser; if (!s) return; const [a, b] = s.w.erasers; s.testFlick(Math.atan2(b.y - a.y, b.x - a.x), 0.45 + Math.random() * 0.4); }); await page.waitForTimeout(400); }, 160_000);
  expect(errors).toEqual([]);
});

test('Paper Airplane: the accuracy challenge shows its folds and finishes', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  await open(page, 'paper-plane');
  await page.getByRole('button', { name: 'Accuracy' }).click();
  await page.getByRole('button', { name: /Hawk/ }).click();
  await page.getByTestId('start').click();
  await loop(page, async () => { await page.keyboard.down('Space'); await page.waitForTimeout(800); await page.keyboard.up('Space'); await page.waitForTimeout(1400); }, 140_000);
  expect(errors).toEqual([]);
});
