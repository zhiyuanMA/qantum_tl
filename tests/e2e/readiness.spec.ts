import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const viewAs = (page: Page, leader: string) => page.getByLabel('Viewing as').selectOption({ label: leader });

const openVisit = async (page: Page, leader: string, visitId: string) => {
  await page.goto('./');
  await viewAs(page, leader);
  await page.locator('.calendar').getByRole('link', { name: new RegExp(`^${visitId},`) }).click();
  await expect(page.getByRole('region', { name: 'Readiness decision' })).toBeVisible();
};

const decision = (page: Page) => page.getByRole('region', { name: 'Readiness decision' });

test('AC1: shared stock is ready for the earlier team and short for the later team', async ({ page }) => {
  await openVisit(page, 'North team leader', 'V-102');
  await expect(decision(page)).toContainText('Ready');

  await openVisit(page, 'South team leader', 'V-103');
  await expect(decision(page)).toContainText('Short by 10 each');
  await expect(page.getByText(/Planned use by V-102 \(Team North/)).toBeVisible();
});

test('AC2: same-day contention shows a conflict for both leaders', async ({ page }) => {
  for (const [leader, visit] of [['North team leader', 'V-104'], ['South team leader', 'V-105']] as const) {
    await openVisit(page, leader, visit);
    await expect(decision(page)).toContainText('Stock conflict: 30 needed, 20 available');
    await expect(decision(page)).not.toContainText('Ready');
  }
});

test('AC4: one short product blocks the visit and all products are shown', async ({ page }) => {
  await openVisit(page, 'North team leader', 'V-111');
  await expect(decision(page)).toContainText('Short');
  await expect(page.locator('.material')).toHaveCount(4);
});

test('AC10: a zero-product visit is shown as normal', async ({ page }) => {
  await openVisit(page, 'North team leader', 'V-115');
  await expect(decision(page)).toContainText('No products listed in catalogue');
  await expect(page.getByRole('heading', { name: 'Escalate this visit' })).toHaveCount(0);
});

test('AC12: a leader generates an escalation and marks it', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openVisit(page, 'South team leader', 'V-103');

  await page.getByLabel('Note (optional)').fill('Crew is booked');
  const preview = page.getByLabel('Escalation message preview');
  await expect(preview).toContainText('Request: Expedite supply');
  await expect(preview).toContainText('Please get 10 each of FIRECO SL COLLAR 55mm');
  await expect(preview).toContainText('Note: Crew is booked');

  await page.getByRole('button', { name: 'Copy message' }).click();
  await expect(page.getByText(/Copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('short by 10 each');

  await page.getByRole('button', { name: /mark it as escalated/ }).click();
  await expect(decision(page)).toContainText('Escalated');

  await page.reload();
  await expect(decision(page)).toContainText('Escalated');

  await page.getByRole('link', { name: '← All visits' }).click();
  await expect(page.getByRole('link', { name: /^V-103,.*\. Escalated$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Needs action/ })).toContainText('1 escalated');
});

test('AC19: a leader escalates one product across visits from the dashboard', async ({ page, isMobile }) => {
  await page.goto('./');
  await viewAs(page, 'South team leader');
  if (isMobile) await page.getByRole('button', { name: 'Show breakdown and materials' }).click();
  await page.getByRole('link', { name: 'Escalate FIRECO SL COLLAR 55mm Retrofit Collar' }).click();
  await expect(page.getByLabel('Escalation message preview')).toContainText('for 2 visits');
  await page.getByRole('button', { name: 'I\'ve sent it: mark 2 items as escalated' }).click();
  await page.getByRole('link', { name: '← All visits' }).click();
  await expect(page.getByRole('link', { name: /^V-116,.*\. Escalated$/ })).toBeVisible();
});

test('the phone view keeps the charts folded until asked', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Materials to chase' })).toBeHidden();
  await page.getByRole('button', { name: 'Show breakdown and materials' }).click();
  await expect(page.getByRole('region', { name: 'Materials to chase' })).toBeVisible();
});

test('filters by state', async ({ page, isMobile }) => {
  await page.goto('./');
  if (isMobile) await page.getByRole('button', { name: 'Show breakdown and materials' }).click();
  await page.getByRole('button', { name: /^Short/ }).click();
  await expect(page.locator('.calendar-chip')).toHaveCount(3);
});

test('AC15: the overview shows what needs action and leads to it', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Today, /);
  await expect(page.getByRole('region', { name: 'Next 14 days' })).toContainText('4 of 8 visits need action');
  await expect(page.getByRole('button', { name: /^Needs action/ })).toContainText('4');
  await expect(page.getByRole('button', { name: /^Ready to go/ })).toContainText('3');
  await page.getByRole('link', { name: /Act on next/ }).click();
  await expect(decision(page)).toContainText('Stock conflict');
});

test('AC16: the calendar opens a visit, and the list holds the same visits', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.calendar-chip')).toHaveCount(8);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.visit-row')).toHaveCount(8);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('link', { name: /^V-106,/ }).click();
  await expect(decision(page)).toContainText('Ready');
});

test('AC16: today is highlighted, including on a weekend', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+13:00')); // Saturday
  await page.goto('./');
  await expect(page.locator('.calendar-today')).toBeVisible();
  await expect(page.locator('.calendar-today')).toContainText('Today');
});

test('AC22: today\'s visits are shown first', async ({ page }) => {
  await page.goto('./');
  const today = page.getByRole('region', { name: /^Today,/ });
  await expect(today).toContainText('1 visit today, ready');
  await today.getByRole('link', { name: /^V-101,/ }).click();
  await expect(decision(page)).toContainText('Ready');
});

test('AC17: a stat tile filters the visits', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Needs action/ }).click();
  await expect(page.locator('.calendar-chip')).toHaveCount(4);
});

test('AC14: the core flow works from the keyboard', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile));
  await page.goto('./');
  await page.getByRole('link', { name: /^V-104,/ }).focus();
  await page.keyboard.press('Enter');
  await expect(decision(page)).toBeVisible();
  await page.getByLabel('What do you need?').focus();
  await expect(page.getByLabel('What do you need?')).toBeFocused();
});

test.describe('quality', () => {
  const paths = ['./', 'visits/V-101/', 'visits/V-104/', 'visits/V-110/'];

  for (const path of paths) {
    test(`AC14: ${path} has no automated accessibility violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(violations.map((item) => `${item.id}: ${item.nodes[0]?.html}`)).toEqual([]);
    });

    test(`AC14: ${path} has no horizontal page scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
