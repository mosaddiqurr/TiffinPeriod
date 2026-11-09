import { expect, test, type Page } from '@playwright/test';

// Naam Desh Ful Fol online: two pages play each other through the real online server (the local Cloudflare Worker).

test.skip(({ isMobile }) => isMobile);
test.setTimeout(300_000);

type ND = { view: { phase: string; r: number; g: number; totals: [number, number]; letter: { bn: string; words: string[][] } } };

async function prep(page: Page, name: string) {
  await page.addInitScript((nm) => {
    localStorage.setItem('tp.v1.settings', '{"lang":"en","sound":false}');
    localStorage.setItem('tp.v1.online.name', JSON.stringify(nm));
  }, name);
}

const view = (p: Page) => p.evaluate(() => {
  const d = (window as unknown as { __ndOnline?: ND }).__ndOnline;
  return d ? { phase: d.view.phase, r: d.view.r, g: d.view.g, totals: d.view.totals, letter: d.view.letter.bn, words: d.view.letter.words } : null;
});

async function step(p: Page) {
  const v = await view(p);
  if (!v) return;
  if (v.phase === 'write' && await p.getByTestId('submit-words').isVisible().catch(() => false)) {
    const typed = [v.words[0][0], `${v.letter}খখখ`, v.words[2][0], ''];
    for (let c = 0; c < 4; c++) if (typed[c]) await p.getByTestId(`word-${c}`).fill(typed[c]);
    await p.getByTestId('submit-words').click();
  } else if (v.phase === 'review' && await p.locator('[data-testid^="rev-ok-"]').count()) {
    await p.locator('[data-testid^="rev-no-"]').first().click();
    await p.getByTestId('send-review').click();
  } else if (v.phase === 'between') {
    await p.getByTestId('next-round').click().catch(() => {});
  }
}

async function playOut(pages: Page[]) {
  for (let i = 0; i < 400; i++) {
    const vis = await Promise.all(pages.map((p) => p.getByTestId('result').isVisible()));
    if (vis.every(Boolean)) return;
    for (const p of pages) await step(p);
    await pages[0].waitForTimeout(400);
  }
  throw new Error('match did not finish');
}

test('room, whole match on both pages, rematch, and leaving', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  await prep(a, 'Rafi'); await prep(b, 'Tamim');
  await a.goto('/#/play/naam-desh');
  await a.getByTestId('mode-online').click();
  await a.getByTestId('create-room').click();
  const code = await a.getByTestId('room-code').getAttribute('aria-label');
  await b.goto(`/#/play/naam-desh?room=${code}`);
  await expect(a.getByTestId('online-match')).toBeVisible({ timeout: 20_000 });
  await expect(b.getByTestId('online-match')).toBeVisible({ timeout: 20_000 });
  expect((await view(a))!.letter).toBe((await view(b))!.letter);
  await playOut([a, b]);
  const va = (await view(a))!, vb = (await view(b))!;
  expect(va.totals).toEqual([...vb.totals].reverse());
  await a.getByTestId('rematch').click();
  await b.getByTestId('rematch').click();
  await expect(a.getByTestId('result')).toHaveCount(0);
  expect((await view(a))!.g).toBe(2);
  await b.goto('/#/');
  await expect(a.getByText('left the match')).toBeVisible({ timeout: 25_000 });
  await ctx.close();
});

test('quick match: the stand-in plays a whole match and a rematch', async ({ browser }) => {
  const ctx = await browser.newContext();
  const c = await ctx.newPage();
  await prep(c, 'Nabil');
  await c.goto('/#/play/naam-desh');
  await c.getByTestId('mode-online').click();
  await c.getByTestId('quick-match').click();
  await expect(c.getByTestId('online-match')).toBeVisible({ timeout: 25_000 });
  await playOut([c]);
  await c.getByTestId('rematch').click();
  await expect(c.getByTestId('result')).toHaveCount(0, { timeout: 15_000 });
  await ctx.close();
});
