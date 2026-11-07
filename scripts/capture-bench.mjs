import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('test-results/bench-visuals');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
try {
  for (const [profile, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } })) {
    const page = await browser.newPage({ viewport, hasTouch: profile === 'mobile', isMobile: profile === 'mobile' });
    await page.addInitScript(() => localStorage.setItem('tp.v1.settings', JSON.stringify({ lang: 'bn', sound: false })));
    await page.goto('http://localhost:4173/');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/${profile}-hub.png`, fullPage: true, animations: 'disabled' });
    for (const id of ['chor-police', 'naam-desh', 'jor-bejor', 'bagh-bandi']) {
      await page.goto(`http://localhost:4173/#/play/${id}`);
      await page.getByTestId('start').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${output}/${profile}-${id}-setup.png`, animations: 'disabled' });
      await page.getByTestId('start').click();
      if (id === 'chor-police') { await page.getByTestId('ready').click(); await page.getByTestId('hide-role').click(); }
      if (id === 'bagh-bandi') await page.getByTestId('node-1').click();
      await page.screenshot({ path: `${output}/${profile}-${id}-play.png`, animations: 'disabled' });
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log(output);
