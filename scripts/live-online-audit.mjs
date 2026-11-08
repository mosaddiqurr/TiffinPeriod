import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Two isolated browser contexts: BroadcastChannel cannot connect these clients.
// This verifies the deployed realtime connection without replacing its transport.
const base = process.env.PW_BASE_URL || 'http://localhost:4173';
const out = path.resolve(process.env.QA_OUTPUT || `.gstack/qa-reports/live-online-${Date.now()}`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const report = { base, started: new Date().toISOString(), cases: [] };
try {
  const inventory = await browser.newPage();
  await inventory.goto(base);
  const games = await inventory.locator('a[href*="#/play/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href').split('/').pop()));
  await inventory.close();
  for (const game of games.filter((g) => !process.env.QA_GAMES || process.env.QA_GAMES.split(',').includes(g))) {
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const [a, b] = pages;
    const row = { game, checks: [], errors: [], sockets: [], failures: [] };
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      p.setDefaultTimeout(12000);
      p.on('pageerror', (e) => row.errors.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error') row.errors.push(m.text()); });
      p.on('websocket', (s) => row.sockets.push(new URL(s.url()).origin));
      await p.addInitScript((name) => {
        localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: 'en', sound: false }));
        localStorage.setItem('tp.v1.online.name', JSON.stringify(name));
      }, i === 0 ? 'QA Host' : 'QA Guest');
    }
    try {
      await a.goto(`${base}/#/play/${game}`);
      await a.getByTestId('setup').waitFor();
      if (!await a.getByTestId('mode-online').isVisible()) {
        row.checks.push('no online mode offered');
      } else {
        await a.getByTestId('mode-online').tap();
        await a.getByTestId('online-name').fill('QA Host');
        await expect(a.getByTestId('online-name')).toHaveValue('QA Host');
        await a.getByTestId('create-room').tap();
        await expect(a.getByTestId('room-code').or(a.getByTestId('online-error'))).toBeVisible({ timeout: 20000 });
        if (await a.getByTestId('online-error').isVisible()) throw new Error(await a.getByTestId('online-error').innerText());
        row.checks.push('live room created');
        const code = await a.getByTestId('room-code').getAttribute('aria-label');
        await b.goto(`${base}/#/play/${game}?room=${code}`);
        if (game === 'chor-police') {
          await expect(a.getByTestId('seat-1')).toContainText('QA Guest');
          await a.getByTestId('start-party').tap();
        }
        await expect(a.getByTestId('online-match')).toBeVisible({ timeout: 25000 });
        await expect(b.getByTestId('online-match')).toBeVisible({ timeout: 25000 });
        row.checks.push('two isolated phones joined same match');
        await a.screenshot({ path: path.join(out, `${game}-host.jpg`), type: 'jpeg', quality: 65 });
        await b.screenshot({ path: path.join(out, `${game}-guest.jpg`), type: 'jpeg', quality: 65 });
        row.widths = await Promise.all(pages.map((p) => p.evaluate(() => ({ layout: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))));
        await b.goto(`${base}/#/`);
        await expect(a.getByText(game === 'chor-police' ? /left.*stand-in/ : /left the match/)).toBeVisible({ timeout: 20000 });
        row.checks.push('disconnect reaches opponent');
      }
    } catch (e) {
      row.failures.push(e.message.split('\n').slice(0, 6).join('\n'));
      row.text = await a.locator('body').innerText().catch(() => '');
      await a.screenshot({ path: path.join(out, `${game}-failure.jpg`), type: 'jpeg', quality: 65 }).catch(() => {});
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
      report.cases.push(row);
      await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(row));
    }
  }
} finally {
  report.finished = new Date().toISOString();
  await writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(`REPORT=${out}`);
}
