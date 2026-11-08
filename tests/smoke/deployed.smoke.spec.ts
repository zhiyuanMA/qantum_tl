import { expect, test } from '@playwright/test';

test('the deployed site shows a known visit from sample data', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Sample data.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming visits' })).toBeVisible();
  await page.locator('.calendar').getByRole('link', { name: /^V-102,/ }).click();
  await expect(page.getByRole('region', { name: 'Readiness decision' })).toContainText('Ready');
});
