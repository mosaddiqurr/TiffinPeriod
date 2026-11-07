import { expect, test, type Page } from '@playwright/test';

/** The start screen shows big mode tiles first: tap one (the given mode, or the one already chosen) to reach its settings and Start. */
async function pickTile(page: Page, id?: string) {
  const tile = id ? page.getByTestId(`tile-${id}`) : page.locator('[data-testid^="tile-"][data-current]');
  if (await tile.count()) await tile.first().click();
}

// Phase 2 browser tests. On desktop each game is played to a real result.
// On the phone profile every game is opened and started (smoke test).

const PHASE2 = ['pen-fight', 'rubber-band', 'notebook-drawing', 'elonti-belonti', 'paper-plane', 'paper-boat'];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function open(page: Page, id: string, option?: string) {
  await page.goto(`./#/play/${id}`);
  await expect(page.getByTestId('setup')).toBeVisible();
  await pickTile(page);
  if (option) await page.getByRole('button', { name: option }).first().click();
  await page.getByTestId('start').click();
}

const result = (page: Page) => page.getByTestId('result');

test('phone: every Phase 2 game opens and starts without errors', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  const errors = trackErrors(page);
  for (const id of PHASE2) {
    await open(page, id);
    await page.waitForTimeout(900);
    await page.goto('./#/');
  }
  await expect(page.getByTestId('card-pen-fight')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Pen Fight 3D: a real drag on your pen shows the power and flicks it', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, 'pen-fight');
  await expect(page.getByTestId('touch-hint')).toBeVisible();
  await page.waitForTimeout(800);
  type PF = { screenOf(i: number, t: number): [number, number]; state: { phase: string; turn: number; pens: Array<{ x: number; y: number }> } };
  const pf = () => (window as unknown as { __penFight: PF }).__penFight;
  const box = (await page.locator('.pf-host canvas').boundingBox())!;
  const g = await page.evaluate(() => { const s = (window as unknown as { __penFight: { screenOf(i: number, t: number): [number, number] } }).__penFight; return { me: s.screenOf(0, 0.15), op: s.screenOf(1, 0) }; });
  void pf;
  const gx = box.x + g.me[0], gy = box.y + g.me[1];
  const dx = g.me[0] - g.op[0], dy = g.me[1] - g.op[1], L = Math.hypot(dx, dy);
  const before = await page.evaluate(() => (window as unknown as { __penFight: PF }).__penFight.state.pens[0]);
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + (dx / L) * 80, gy + (dy / L) * 80, { steps: 10 });
  await expect(page.getByTestId('power-tag')).toBeVisible();
  await expect(page.getByTestId('power-bar')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('power-tag')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __penFight: PF }).__penFight.state.turn), { timeout: 10_000 }).toBe(1);
  const after = await page.evaluate(() => (window as unknown as { __penFight: PF }).__penFight.state.pens[0]);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test.describe('desktop full plays', () => {
  test.skip(({ isMobile }) => isMobile);
  test.setTimeout(200_000);

  test('Pen Fight: keyboard flicks until someone wins', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'pen-fight', 'সহজ');
    for (let i = 0; i < 60 && !(await result(page).isVisible()); i++) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(1100);
      await page.keyboard.up('Space');
      await page.waitForTimeout(1800);
    }
    await expect(result(page)).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('Rubber Band: fifteen shots over three levels', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'rubber-band');
    const box = (await page.locator('canvas').boundingBox())!;
    const s = Math.min(box.width / 1100, box.height / 620);
    const ox = box.x + (box.width - 1100 * s) / 2, oy = box.y + (box.height - 620 * s) / 2;
    for (let i = 0; i < 40 && !(await result(page).isVisible()); i++) {
      await page.mouse.move(ox + 120 * s, oy + 420 * s);
      await page.mouse.down();
      await page.mouse.move(ox + (120 - 110) * s, oy + (420 + 45 + (i % 3) * 10) * s, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(2600);
    }
    await expect(result(page)).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('Notebook Drawing: the computer draws eight pictures', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./#/play/notebook-drawing');
    await pickTile(page, 'cpu');
    await page.getByTestId('start').click();
    for (let i = 0; i < 40 && !(await result(page).isVisible()); i++) {
      const opt = page.getByTestId('option').first();
      if (await opt.isEnabled().catch(() => false)) await opt.click().catch(() => {});
      await page.waitForTimeout(900);
    }
    await expect(result(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Notebook Drawing: party mode, one turn each, with real drawing', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./#/play/notebook-drawing');
    await pickTile(page, 'party');
    await page.getByRole('group', { name: 'খেলোয়াড়' }).getByRole('button', { name: '২' }).click();
    await page.getByTestId('start').click();
    for (let turn = 0; turn < 2; turn++) {
      await page.getByTestId('show-words').click();
      await page.getByTestId('word').first().click();
      const k = (await page.getByTestId('khata').boundingBox())!;
      await page.mouse.move(k.x + 40, k.y + 40); await page.mouse.down();
      await page.mouse.move(k.x + 200, k.y + 160, { steps: 8 }); await page.mouse.up();
      await page.getByTestId(`got-${turn === 0 ? 1 : 0}`).click();
      await page.getByTestId('next').click();
    }
    await expect(result(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const [id, opt] of [['elonti-belonti', 'কঠিন'], ['paper-boat', 'কঠিন']] as const) {
    test(`${id}: the computer finishes and a result appears`, async ({ page }) => {
      const errors = trackErrors(page);
      await open(page, id, opt);
      await expect(result(page)).toBeVisible({ timeout: 150_000 });
      expect(errors).toEqual([]);
    });
  }

  test('Paper Airplane: three throws with nose-up control', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'paper-plane');
    // Space throws when the plane is on the roof and raises the nose in flight.
    // Keep pressing until all three throws are done (flight length varies).
    const until = Date.now() + 150_000;
    while (Date.now() < until && !(await result(page).isVisible())) {
      await page.keyboard.down('Space'); await page.waitForTimeout(900); await page.keyboard.up('Space');
      await page.waitForTimeout(1600);
    }
    await expect(result(page)).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });
});
