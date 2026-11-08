import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A separate live-site audit: real touch taps, responsive geometry, navigation,
// and browser performance. No scores or persistent server records are seeded.
const base = process.env.PW_BASE_URL || 'http://localhost:4173';
const output = path.resolve(process.env.QA_OUTPUT || `.gstack/qa-reports/mobile-audit-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { base, started: new Date().toISOString(), profiles: [], cases: [], limitations: [
  'Chromium device emulation, not physical phones or iOS Safari.',
  'CPU and network throttling do not emulate a phone GPU, memory pressure, heat or battery.',
  'This audit tests starts and shared controls; full match results belong to the separate regression suite.',
] };
const profiles = [
  { name: 'compact', width: 320, height: 568, scale: 2, cpu: 1 },
  { name: 'low-end', width: 360, height: 800, scale: 1, cpu: 6, slow: true },
  { name: 'high-end', width: 430, height: 932, scale: 3, cpu: 1 },
];
const save = () => writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
const visible = (loc) => loc.isVisible().catch(() => false);
const touch = (loc) => loc.tap({ timeout: 12000 });
let checkpoint = 0, previous;
async function beforeNext(hypothesis, nextCommand) {
  if (previous) await writeFile(path.join(output, `exploration-${String(++checkpoint).padStart(3, '0')}.json`), JSON.stringify({
    observationCommand: previous.command, observed: previous.observed, hypothesis, nextCommand,
  }, null, 2));
}
async function geometry(page) {
  return page.evaluate(({ width, height }) => {
    const controls = [...document.querySelectorAll('button,a,input,select,summary,[role="button"]')].filter((el) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0;
    });
    return {
      width, height, layoutWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
      outsideHorizontal: controls.filter((el) => { const r = el.getBoundingClientRect(); return r.left < -2 || r.right > width + 2; }).map((el) => ({
        text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 90), id: el.getAttribute('data-testid'),
        left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right),
      })).slice(0, 20),
      smallTargets: controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60)).slice(0, 20),
    };
  }, page.viewportSize());
}
async function shot(page, name) {
  const file = `${name}.jpg`;
  await page.screenshot({ path: path.join(output, file), type: 'jpeg', quality: 65, fullPage: false, timeout: 10000 });
  return file;
}
try {
  for (const profile of profiles.filter((p) => !process.env.QA_PROFILES || process.env.QA_PROFILES.split(',').includes(p.name))) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.scale, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [], badResponses = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url().split('?')[0] }); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    if (profile.slow) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
    await page.addInitScript(() => {
      window.__qaLongTasks = [];
      window.__qaPaints = [];
      try { new PerformanceObserver((list) => window.__qaLongTasks.push(...list.getEntries().map((e) => e.duration))).observe({ type: 'longtask', buffered: true }); } catch {}
      try { new PerformanceObserver((list) => window.__qaPaints.push(...list.getEntries().map((e) => ({ name: e.name, time: e.startTime })))).observe({ type: 'paint', buffered: true }); } catch {}
    });
    await beforeNext('Check a cold homepage at this phone size and speed.', `homepage ${profile.name}`);
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('[data-testid^="card-"]').first().waitFor({ timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const games = await page.locator('a[href*="#/play/"]').evaluateAll((els) => els.map((el) => ({ id: el.getAttribute('href').split('/').pop(), title: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 100) })));
    const home = { profile: profile.name, ...await geometry(page), games, screenshot: await shot(page, `${profile.name}-home`), performance: await page.evaluate(() => ({ paints: window.__qaPaints, longTasks: window.__qaLongTasks, navigation: performance.getEntriesByType('navigation').map((n) => ({ domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd, transferBytes: n.transferSize })) })) };
    report.profiles.push(home);
    previous = { command: `homepage ${profile.name}`, observed: home };
    console.log(JSON.stringify({ event: 'homepage', profile: profile.name, games: games.length, width: home.documentWidth, paints: home.performance.paints }));
    await save();
    for (const lang of (process.env.QA_LANGS || 'en,bn').split(',')) {
      await page.evaluate((l) => { const s = JSON.parse(localStorage.getItem('tp.v1.settings') || '{}'); localStorage.setItem('tp.v1.settings', JSON.stringify({ ...s, lang: l, sound: false })); }, lang);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      for (const game of games.filter((g) => !process.env.QA_GAMES || process.env.QA_GAMES.split(',').includes(g.id))) {
        const command = `touch flow ${profile.name} ${lang} ${game.id}`;
        await beforeNext('Verify the next game and shared controls on the same phone profile.', command);
        const row = { profile: profile.name, lang, game: game.id, checks: [], errors: [], failures: [], geometry: {} };
        const fromError = errors.length, fromResponse = badResponses.length;
        const check = (name) => row.checks.push(name);
        try {
          await page.goto(`${base}/#/play/${game.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.getByTestId('setup').waitFor({ timeout: 30000 });
          check('setup opens');
          row.geometry.setup = await geometry(page);
          row.screenshot = await shot(page, `${profile.name}-${lang}-${game.id}-setup`);
          const help = page.locator('.game-bar button').filter({ has: page.locator('svg') }).nth(1);
          // The second bar button is Help. Inspect accessible text before acting.
          const helpLabel = await help.getAttribute('aria-label');
          if (/How to play|কীভাবে খেলবে/i.test(helpLabel || '')) {
            await touch(help);
            await page.getByRole('dialog').last().waitFor();
            await touch(page.getByRole('dialog').last().getByRole('button').last());
            check('help opens and closes');
          }
          const quick = page.getByTestId('mode-quick');
          if (await visible(quick)) await touch(quick);
          else {
            const tile = page.locator('[data-testid^="tile-"][data-current]').first();
            if (await visible(tile)) await touch(tile);
          }
          const start = page.getByTestId('start');
          await start.waitFor();
          row.geometry.options = await geometry(page);
          row.optionsScreenshot = await shot(page, `${profile.name}-${lang}-${game.id}-options`);
          check('mode and settings reachable');
          await touch(start);
          await page.waitForTimeout(profile.slow ? 900 : 400);
          if (await visible(page.getByTestId('rotate-gate'))) {
            // Headless Chromium cannot resize a fullscreen window. Real rotation
            // is still checked after exiting the emulated fullscreen window.
            await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
            await page.setViewportSize({ width: profile.height, height: profile.width });
            await page.getByTestId('rotate-gate').waitFor({ state: 'hidden' });
            check('rotation releases orientation gate');
          }
          check('start accepts touch');
          row.geometry.play = await geometry(page);
          row.playScreenshot = await shot(page, `${profile.name}-${lang}-${game.id}-play`);
          const pause = page.getByTestId('pause');
          if (await visible(pause)) {
            await touch(pause);
            const dialog = page.getByRole('dialog').last();
            await dialog.waitFor();
            row.geometry.pause = await geometry(page);
            await touch(dialog.getByRole('button', { name: /^(Resume|আবার চালাও)$/ }).first());
            check('pause and resume');
            await touch(pause);
            await touch(page.getByRole('dialog').last().getByRole('button', { name: /^(Restart|নতুন করে শুরু)$/ }));
            await page.waitForTimeout(200);
            check('restart');
          }
          const back = page.locator('.game-bar button').first();
          await touch(back);
          await page.locator('[data-testid^="card-"]').first().waitFor();
          check('back returns to hub');
          if (await page.evaluate(() => !!document.fullscreenElement)) row.failures.push('leaving game does not exit fullscreen');
        } catch (e) {
          row.failures.push(String(e.message).split('\n').slice(0, 5).join('\n'));
          row.failureScreenshot = await shot(page, `${profile.name}-${lang}-${game.id}-failure`).catch(() => null);
        }
        row.errors = errors.slice(fromError);
        row.badResponses = badResponses.slice(fromResponse);
        for (const [state, g] of Object.entries(row.geometry)) if (g.documentWidth > g.width + 1 || g.outsideHorizontal.length) row.failures.push(`horizontal overflow in ${state}: ${JSON.stringify(g.outsideHorizontal)}`);
        report.cases.push(row);
        previous = { command, observed: row };
        await save();
        console.log(JSON.stringify({ event: 'game', profile: profile.name, lang, game: game.id, checks: row.checks.length, failures: row.failures, errors: row.errors }));
        await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
        await page.setViewportSize({ width: profile.width, height: profile.height });
      }
    }
    await context.close();
  }
} finally {
  report.finished = new Date().toISOString();
  await save();
  await browser.close();
  console.log(`REPORT=${output}`);
}
