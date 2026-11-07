import { expect, test, type Page } from '@playwright/test';

// Penalty Shootout online: two pages in one browser talk over BroadcastChannel (tp.net = "local").

test.skip(({ isMobile }) => isMobile);
test.setTimeout(400_000);

type PK = { currentPhase: string; testShoot(x: number, y: number, p: number): boolean; testGuess(x: number, y: number): boolean };
type Duel = { view: { so: { kicks: boolean[][] }; winner: number | null } };

async function prep(page: Page, name: string) {
  await page.addInitScript((nm) => {
    localStorage.setItem('tp.net', '"local"');
    localStorage.setItem('tp.v1.settings', '{"lang":"en","sound":false}');
    localStorage.setItem('tp.v1.online.name', JSON.stringify(nm));
  }, name);
}

/** Shoot or dive, whichever this page has to do now. */
const act = (p: Page) => p.evaluate(() => {
  const s = (window as unknown as { __pk?: PK }).__pk;
  if (!s) return;
  const side = Math.random() < 0.5 ? -1 : 1;
  if (s.currentPhase === 'aim') s.testShoot(side * (0.3 + Math.random() * 0.5), 0.2 + Math.random() * 0.6, 0.6 + Math.random() * 0.2);
  else if (s.currentPhase === 'guess') s.testGuess(side * 0.6, 0.4);
});

async function playOut(pages: Page[]) {
  for (let i = 0; i < 600; i++) {
    const vis = await Promise.all(pages.map((p) => p.getByTestId('result').isVisible()));
    if (vis.every(Boolean)) return;
    for (const p of pages) await act(p);
    await pages[0].waitForTimeout(300);
  }
  throw new Error('match did not finish');
}

const tally = (p: Page) => p.evaluate(() => (window as unknown as { __pkOnline: Duel }).__pkOnline.view);

test('room, whole shootout on both pages, rematch, and leaving', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  await prep(a, 'Rafi'); await prep(b, 'Tamim');
  await a.goto('/#/play/penalty');
  await a.getByTestId('mode-online').click();
  await a.getByTestId('create-room').click();
  const code = await a.getByTestId('room-code').getAttribute('aria-label');
  await b.goto(`/#/play/penalty?room=${code}`);
  await expect(a.getByTestId('online-match')).toBeVisible({ timeout: 20_000 });
  await playOut([a, b]);
  const va = await tally(a), vb = await tally(b);
  expect(va.so.kicks).toEqual(vb.so.kicks);
  expect(va.winner).toBe(vb.winner);
  await a.getByTestId('rematch').click();
  await b.getByTestId('rematch').click();
  await expect(a.getByTestId('result')).toHaveCount(0);
  await b.goto('/#/');
  await expect(a.getByText('left the match')).toBeVisible({ timeout: 25_000 });
  await ctx.close();
});

test('quick match alone: the stand-in arrives and a whole shootout finishes', async ({ page }) => {
  await prep(page, 'Shuvo');
  await page.goto('/#/play/penalty');
  await page.getByTestId('mode-online').click();
  await page.getByTestId('quick-match').click();
  await expect(page.getByTestId('found')).toBeVisible({ timeout: 20_000 });
  await playOut([page]);
  await expect(page.getByTestId('rematch')).toBeVisible();
});
