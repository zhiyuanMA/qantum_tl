import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /smoke/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testIgnore: /smoke/ },
    { name: 'smoke', use: { ...devices['Desktop Chrome'] }, testMatch: /smoke/ },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run serve', url: baseURL, reuseExistingServer: !process.env.CI },
});
