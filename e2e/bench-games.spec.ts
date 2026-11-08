import { expect, test, type Page } from '@playwright/test';
import { LETTERS } from '../src/games/naam-desh/model';
import { createRng } from '../src/engine/rng';

/** The start screen shows big mode tiles first: tap one (the given mode, or the one already chosen) to reach its settings and Start. */
async function pickTile(page: Page, id?: string) {
  const tile = id ? page.getByTestId(`tile-${id}`) : page.locator('[data-testid^="tile-"][data-current]');
  if (await tile.count()) await tile.first().click();
}

async function openGame(page: Page, id: string, lang = 'en', tile?: string) {
  await page.addInitScript((lang) => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang, sound: false })), lang);
  await page.goto(`./#/play/${id}`);
  await expect(page.getByTestId('setup')).toBeVisible();
  await pickTile(page, tile);
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

for (const lang of ['en', 'bn']) test(`bench game setups and help render in ${lang}`, async ({ page }) => {
  for (const id of ['chor-police', 'naam-desh']) {
    await openGame(page, id, lang);
    await expect(page.getByTestId('start')).toBeEnabled();
    await expect(page.getByTestId('start')).toBeInViewport();
    await page.getByTestId('hub-back').click();
    await page.getByTestId('how-to').click();
    await expect(page.locator('.sh-rules ol')).toBeVisible();
    await page.getByTestId('how-to').click();
    await expect(page.locator('.sh-rules')).toHaveCount(0);
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
  await openGame(page, 'chor-police', 'en', 'party');
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
  await openGame(page, 'naam-desh', 'en', 'local2p'); await page.getByTestId('start').click();
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

