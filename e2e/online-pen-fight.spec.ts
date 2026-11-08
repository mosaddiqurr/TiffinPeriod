import { expect, test, type Page } from '@playwright/test';

// Pen Fight online: two pages in one browser talk over BroadcastChannel (tp.net = "local").

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });
test.skip(({ isMobile }) => isMobile);
test.setTimeout(400_000);

type PF = { state: { phase: string; turn: number; seq: number; scores: number[]; pens: Array<{ x: number; y: number }> }; testFlick(t: number, dir: number, p: number): boolean };

async function prep(page: Page, name: string) {
  await page.addInitScript((nm) => {
    localStorage.setItem('tp.net', 'local');
    localStorage.setItem('tp.v1.settings', '{"lang":"en","sound":false}');
    localStorage.setItem('tp.v1.online.name', JSON.stringify(nm));
  }, name);
}

const flick = (p: Page, me: number) => p.evaluate((me) => {
  const g = (window as unknown as { __penFight?: PF }).__penFight;
  if (!g) return false;
  const s = g.state;
  if (s.phase !== 'aim' || s.turn !== me) return false;
  const a = s.pens[me], b = s.pens[1 - me];
  return g.testFlick(0, Math.atan2(b.y - a.y, b.x - a.x), 0.9);
}, me);

async function playOut(pages: Page[], sides: number[]) {
  for (let i = 0; i < 600; i++) {
    const vis = await Promise.all(pages.map((p) => p.getByTestId('result').isVisible()));
    if (vis.every(Boolean)) return;
    for (let k = 0; k < pages.length; k++) await flick(pages[k], sides[k]);
    await pages[0].waitForTimeout(400);
  }
  throw new Error('match did not finish');
}

test('room, whole match on both pages, rematch, and leaving', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  await prep(a, 'Rafi'); await prep(b, 'Tamim');
  await a.goto('/#/play/pen-fight');
  await a.getByTestId('mode-online').click();
  await a.getByTestId('create-room').click();
  const code = await a.getByTestId('room-code').getAttribute('aria-label');
  await b.goto(`/#/play/pen-fight?room=${code}`);
  await b.getByTestId('pen-pick-gel').click();
  await b.getByTestId('pen-ready').click();
  await a.getByTestId('pen-ready').click();
  await playOut([a, b], [0, 1]);
  const sa = await a.evaluate(() => (window as unknown as { __penFight: PF }).__penFight.state.scores);
  const sb = await b.evaluate(() => (window as unknown as { __penFight: PF }).__penFight.state.scores);
  expect(sa).toEqual(sb);
  expect(Math.max(...sa)).toBe(3);
  await a.getByTestId('rematch').click();
  await b.getByTestId('rematch').click();
  await expect(a.getByTestId('result')).toHaveCount(0);
  await b.goto('/#/');
  await expect(a.getByText('left the match')).toBeVisible({ timeout: 25_000 });
  await ctx.close();
});

test('quick match alone: the stand-in arrives and a whole match finishes', async ({ page }) => {
  await prep(page, 'Shuvo');
  await page.goto('/#/play/pen-fight');
  await page.getByTestId('mode-online').click();
  await page.getByTestId('quick-match').click();
  await expect(page.getByTestId('found')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('pen-ready').click();
  await playOut([page], [1]);
  await expect(page.getByTestId('rematch')).toBeVisible();
});
