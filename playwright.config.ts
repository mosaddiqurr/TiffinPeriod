import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.PW_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: externalBaseURL || 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
    },
  },
  webServer: externalBaseURL ? undefined : {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
