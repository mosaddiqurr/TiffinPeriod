import { expect, test } from '@playwright/test';

test('compact phone keeps every header action on screen in both languages', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 320, height: 568 });
  for (const lang of ['bn', 'en']) {
    await page.goto('./');
    await page.evaluate((l) => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: l, sound: false })), lang);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    for (const route of ['', '#/settings', '#/records']) {
      await page.goto(`./${route}`);
      await expect(page.locator('.cover-inner')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      for (const action of await page.locator('.cover-inner a, .cover-inner button').all()) await expect(action).toBeInViewport({ ratio: 1 });
    }
  }
});

test('leaving a wide game exits fullscreen when orientation lock is rejected', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  // Real boundary: model a browser that accepts fullscreen but rejects locking
  // orientation, without adding a test hook to production code.
  await page.addInitScript(() => {
    let fullscreen: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { get: () => fullscreen });
    Element.prototype.requestFullscreen = async function () { fullscreen = this; };
    document.exitFullscreen = async () => { fullscreen = null; };
    Object.defineProperty(screen.orientation, 'lock', { value: async () => { throw new DOMException('Not supported', 'NotSupportedError'); } });
    localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: 'en', sound: false }));
  });
  await page.goto('./#/play/rubber-band');
  await page.locator('[data-testid^="tile-"][data-current]').click();
  await page.getByTestId('start').click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole('button', { name: 'All games', exact: true }).click();
  await expect(page.getByTestId('card-rubber-band')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('compact phone can select either Flikk Football style without clipping', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 320, height: 568 });
  for (const lang of ['bn', 'en']) {
    await page.goto('./');
    await page.evaluate((l) => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: l, sound: false })), lang);
    await page.goto('./#/play/flikk-football');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await page.getByTestId('mode-quick').tap();
    for (const style of ['free', 'fixed']) {
      const button = page.getByTestId(`style-${style}`);
      await button.tap();
      await expect(button).toHaveAttribute('aria-checked', 'true');
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  }
});

test('settings controls, names, volume and language persist on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'English', exact: true }).tap();
  const values: Record<string, string> = {};
  for (const control of await page.getByRole('switch').all()) {
    const label = (await control.getAttribute('aria-label'))!;
    const before = await control.getAttribute('aria-checked');
    await control.tap();
    values[label] = before === 'true' ? 'false' : 'true';
    await expect(control).toHaveAttribute('aria-checked', values[label]);
  }
  await page.locator('#vol').fill('0.35');
  await page.locator('#p1').fill('QA Player One');
  await page.locator('#p2').fill('QA Player Two');
  await page.reload();
  for (const [label, checked] of Object.entries(values)) await expect(page.getByRole('switch', { name: label, exact: true })).toHaveAttribute('aria-checked', checked);
  await expect(page.locator('#vol')).toHaveValue('0.35');
  await expect(page.locator('#p1')).toHaveValue('QA Player One');
  await expect(page.locator('#p2')).toHaveValue('QA Player Two');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'বাংলা', exact: true }).tap();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
});

test('installed service worker reloads the hub and every game offline', async ({ page, context, isMobile }) => {
  test.skip(!isMobile);
  test.setTimeout(180_000);
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // Cache a navigation under the active worker.
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const games = await page.locator('a[href*="#/play/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')!));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(17);
  for (const href of games) {
    await page.goto(`./${href}`);
    await expect(page.getByTestId('setup')).toBeVisible();
  }
  await context.setOffline(false);
});

for (const game of ['pakhir-ure', 'balloon-burst', 'pen-fight', 'rubber-band', 'elonti-belonti', 'paper-plane', 'paper-boat', 'notebook-drawing']) {
  test(`${game}: Resume from in-game help continues play in one tap`, async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await page.addInitScript(() => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: 'en', sound: false })));
    await page.goto(`./#/play/${game}`);
    await (game === 'notebook-drawing' ? page.getByTestId('tile-cpu') : page.locator('[data-testid^="tile-"][data-current]')).tap();
    await page.getByTestId('start').tap();
    if (await page.getByTestId('rotate-skip').isVisible()) await page.getByTestId('rotate-skip').tap();
    await page.getByTestId('pause').waitFor();
    await page.getByRole('button', { name: 'How to play', exact: true }).tap();
    const help = page.getByRole('dialog', { name: 'How to play', exact: true });
    await expect(help).toBeVisible();
    await help.getByRole('button', { name: 'Resume', exact: true }).tap();
    await expect(help).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('pause')).toBeVisible();
  });
}
