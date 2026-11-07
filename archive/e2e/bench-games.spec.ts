import { expect, test, type Page } from '@playwright/test';
import { LETTERS } from '../src/games/naam-desh/model';
import { applyMove, chooseMove, initialPosition, positionKey, verdict } from '../src/games/bagh-bandi/model';
import { createRng } from '../src/engine/rng';

async function openGame(page: Page, id: string, lang = 'en') {
  await page.addInitScript((lang) => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang, sound: false })), lang);
  await page.goto(`./#/play/${id}`);
  await expect(page.getByTestId('setup')).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.locator('.bench-root').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  (page as Page & { gameErrors: string[] }).gameErrors = errors;
});
test.afterEach(async ({ page }) => { expect((page as Page & { gameErrors: string[] }).gameErrors).toEqual([]); });

for (const lang of ['en', 'bn']) test(`four new game setups render in ${lang}`, async ({ page }) => {
  for (const id of ['chor-police', 'naam-desh', 'jor-bejor', 'bagh-bandi']) {
    await openGame(page, id, lang);
    await expect(page.getByTestId('start')).toBeEnabled();
    await expect(page.getByTestId('start')).toBeInViewport();
    await page.locator('.bench-rules summary').click();
    await expect(page.locator('.bench-rules ol')).toBeVisible();
    await page.locator('.bench-rules summary').click();
    await noOverflow(page);
  }
});

test('Chor Police: three full computer rounds save a result', async ({ page }) => {
  await openGame(page, 'chor-police');
  await page.getByRole('group', { name: 'Rounds', exact: true }).getByRole('button', { name: '3', exact: true }).click();
  await page.getByTestId('start').click();
  for (let round = 0; round < 3; round++) {
    await page.getByTestId('ready').click();
    await expect(page.getByTestId('secret')).toBeVisible();
    await page.getByTestId('hide-role').click();
    await expect(page.getByTestId('secret')).toHaveCount(0);
    const suspects = page.locator('.paper-chit:not([disabled])');
    if (await suspects.count()) await suspects.first().click();
    await page.getByTestId('guess').click();
    await expect(page.locator('.paper-chit')).toHaveCount(4);
    await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('result')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tp.v1.scores')!)['chor-police'].plays)).toBe(1);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.getByTestId('handoff')).toBeVisible();
});

test('Chor Police: four local players keep roles private and police can catch the thief', async ({ page }) => {
  await openGame(page, 'chor-police');
  await page.getByRole('button', { name: '4 friends · pass the device', exact: true }).click();
  await page.getByRole('group', { name: 'Rounds', exact: true }).getByRole('button', { name: '3', exact: true }).click();
  await page.getByTestId('start').click();
  for (let round = 0; round < 3; round++) {
    let thief = 0;
    for (let player = 0; player < 4; player++) {
      await expect(page.locator('.role-name')).toHaveCount(0);
      await page.getByTestId('ready').click();
      if ((await page.locator('.role-name').innerText()) === 'Chor') thief = player;
      await page.getByTestId('hide-role').click();
    }
    await page.getByTestId(`chit-${thief}`).click();
    await page.getByTestId('guess').click();
    await expect(page.getByRole('status')).toContainText('Caught!');
    await noOverflow(page);
    await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('result')).toBeVisible();
});

test('Jor-Bejor: local hidden hands, zero is even, and a full match', async ({ page }) => {
  await openGame(page, 'jor-bejor');
  await page.getByRole('button', { name: '2 players', exact: true }).click();
  await page.getByTestId('start').click();
  for (let round = 0; round < 3; round++) {
    await page.getByTestId('finger-0').click(); await page.getByTestId('lock-hand').click();
    await expect(page.getByTestId('handoff')).toBeVisible();
    await expect(page.locator('.finger-picks')).toHaveCount(0);
    await page.getByTestId('ready').click();
    await page.getByTestId('finger-0').click(); await page.getByTestId('lock-hand').click();
    await expect(page.getByRole('status')).toContainText('0 + 0 = 0');
    await noOverflow(page); await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('result')).toBeVisible();
});

test('Jor-Bejor: a full computer match and pause/resume', async ({ page }) => {
  await openGame(page, 'jor-bejor'); await page.getByTestId('start').click();
  await page.getByTestId('pause').click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.getByRole('dialog', { name: 'How to play' }).getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (let i = 0; i < 5 && !await page.getByTestId('result').isVisible(); i++) {
    await page.getByTestId(`finger-${i % 6}`).click(); await page.getByTestId('lock-hand').click();
    await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('result')).toBeVisible();
});

test('Naam Desh: valid words, wrong initials, typing P, pause timer and full practice', async ({ page }) => {
  await openGame(page, 'naam-desh'); await page.getByTestId('start').click();
  const seen: string[] = [];
  for (let round = 0; round < 3; round++) {
    const letter = (await page.getByTestId('letter').innerText()).trim();
    expect(seen).not.toContain(letter); seen.push(letter);
    const data = LETTERS.find((l) => l.bn === letter)!;
    if (round === 0) {
      await page.getByTestId('word-0').pressSequentially('P');
      await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
      await page.getByTestId('pause').click();
      const remaining = await page.getByTestId('timer').innerText();
      await page.waitForTimeout(1200);
      await expect(page.getByTestId('timer')).toHaveText(remaining);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
    }
    for (let cat = 0; cat < 4; cat++) await page.getByTestId(`word-${cat}`).fill(data.words[cat][0]);
    await page.getByTestId('submit-words').click();
    await expect(page.locator('.word-review input:checked')).toHaveCount(4);
    await noOverflow(page); await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('result')).toContainText('120');
});

test('Naam Desh: local duplicate answers score five each and pages stay private', async ({ page }) => {
  await openGame(page, 'naam-desh'); await page.getByRole('button', { name: '2 players', exact: true }).click(); await page.getByTestId('start').click();
  for (let round = 0; round < 3; round++) {
    await page.getByTestId('ready').click();
    const letter = (await page.getByTestId('letter').innerText()).trim();
    const data = LETTERS.find((l) => l.bn === letter)!;
    for (let player = 0; player < 2; player++) {
      for (let cat = 0; cat < 4; cat++) await page.getByTestId(`word-${cat}`).fill(data.words[cat][0]);
      await page.getByTestId('submit-words').click();
      if (player === 0) {
        await expect(page.locator('.word-fields')).toHaveCount(0);
        await page.getByTestId('ready').click();
        await expect(page.getByTestId('word-0')).toHaveValue('');
      }
    }
    await expect(page.locator('.word-review input:checked')).toHaveCount(8);
    await expect(page.locator('.word-review tbody td small').first()).toContainText('5 points');
    await page.getByTestId('next-round').click();
  }
  await expect(page.getByTestId('result')).toContainText('60');
  await expect(page.getByTestId('result')).toContainText('A shared win');
});

test('Naam Desh: timer expiration submits once without extra user input', async ({ page }) => {
  await openGame(page, 'naam-desh');
  await page.clock.install();
  await page.getByRole('group', { name: 'Timer', exact: true }).getByRole('button', { name: '30', exact: true }).click();
  await page.getByTestId('start').click();
  await page.clock.runFor(31000);
  await expect(page.locator('.word-review')).toBeVisible();
  await expect(page.locator('.word-review input:checked')).toHaveCount(0);
  await page.clock.runFor(31000);
  await expect(page.locator('.word-review')).toBeVisible();
  await expect(page.getByTestId('result')).toHaveCount(0);
});

test('Bagh Bandi: computer replies legally, take-back restores the opening and pause works', async ({ page }) => {
  await openGame(page, 'bagh-bandi'); await page.getByTestId('start').click();
  await page.getByTestId('node-1').click();
  await expect(page.getByTestId('node-6')).toHaveClass(/legal/);
  await page.getByTestId('node-6').click();
  await expect(page.getByTestId('turn-status')).toContainText('Computer');
  await expect(page.getByTestId('turn-status')).toContainText('You', { timeout: 10000 });
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('node-1')).toHaveAttribute('aria-label', /Goats 5/);
  await expect(page.getByTestId('node-6')).toHaveAttribute('aria-label', /Empty/);
  await page.getByTestId('pause').click(); await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await noOverflow(page);
});

test('Bagh Bandi: a complete game via legal board clicks reaches a natural result', async ({ page }) => {
  test.setTimeout(120000);
  await openGame(page, 'bagh-bandi'); await page.getByRole('button', { name: '2 players', exact: true }).click(); await page.getByTestId('start').click();
  let state = initialPosition(); const rng = createRng(44), seen = new Map<string, number>([[positionKey(state), 1]]);
  for (let i = 0; i < 300 && !verdict(state); i++) {
    const move = chooseMove(state, 1, () => rng.next())!;
    await page.getByTestId(`node-${move.from}`).click();
    await expect(page.getByTestId(`node-${move.to}`)).toHaveClass(/legal/);
    await page.getByTestId(`node-${move.to}`).click();
    state = applyMove(state, move);
    const key = positionKey(state), count = (seen.get(key) ?? 0) + 1; seen.set(key, count);
    if (count >= 3) break;
  }
  await expect(page.getByTestId('result')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tp.v1.scores')!)['bagh-bandi'].plays)).toBe(1);
});

test('Bagh Bandi: human tigers get a legal opening from the hard goat computer', async ({ page }) => {
  await openGame(page, 'bagh-bandi');
  await page.getByRole('group', { name: 'Your side', exact: true }).getByRole('button', { name: 'Tigers', exact: true }).click();
  await page.getByRole('button', { name: 'Hard', exact: true }).click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('turn-status')).toContainText('You', { timeout: 15000 });
  await expect(page.getByTestId('turn-status')).toContainText('Tigers');
  await expect(page.locator('.bagh-node .piece.goat')).toHaveCount(5);
  await page.getByRole('button', { name: 'Concede match', exact: true }).click();
  await expect(page.getByTestId('result')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('Computer');
});
