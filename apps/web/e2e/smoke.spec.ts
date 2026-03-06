import { test, expect } from '@playwright/test';
import { loginViaAPI, expectPageHeading } from './helpers';

test.describe('Smoke Tests - All pages load correctly', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('Dashboard loads', async ({ page }) => {
    await page.goto('/');
    await expectPageHeading(page, 'Dashboard');
  });

  test('Candidats page loads', async ({ page }) => {
    await page.goto('/candidats');
    await expectPageHeading(page, 'Candidats');
    // Should display a table or empty state
    await expect(
      page.locator('table, [class*="empty"], [data-testid="empty-state"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Clients page loads', async ({ page }) => {
    await page.goto('/clients');
    await expectPageHeading(page, 'Clients');
    await expect(
      page.locator('table, [class*="empty"], [data-testid="empty-state"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Entreprises page loads', async ({ page }) => {
    await page.goto('/entreprises');
    await expectPageHeading(page, 'Entreprises');
    await expect(
      page.locator('table, [class*="empty"], [data-testid="empty-state"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Mandats page loads', async ({ page }) => {
    await page.goto('/mandats');
    await expectPageHeading(page, 'Mandats');
    await expect(
      page.locator('table, [class*="empty"], [data-testid="empty-state"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('Activites page loads', async ({ page }) => {
    await page.goto('/activites');
    await expectPageHeading(page, 'Activit');
  });

  test('Taches page loads', async ({ page }) => {
    await page.goto('/taches');
    await expectPageHeading(page, 'ches');
  });

  test('Templates page loads', async ({ page }) => {
    await page.goto('/templates');
    await expectPageHeading(page, 'Templates');
  });

  test('Notifications page loads', async ({ page }) => {
    await page.goto('/notifications');
    await expectPageHeading(page, 'Notifications');
  });

  test('Mon Espace page loads', async ({ page }) => {
    await page.goto('/mon-espace');
    await expectPageHeading(page, 'Mon Espace');
  });

  test('Settings page loads (admin)', async ({ page }) => {
    await page.goto('/settings');
    await expectPageHeading(page, 'tres');
  });

  test('Import page loads', async ({ page }) => {
    await page.goto('/import');
    // Import page should have a heading or content visible
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('No JavaScript errors on main pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    const pages = ['/', '/candidats', '/clients', '/entreprises', '/mandats'];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    // Filter out non-critical errors (like network errors from API calls)
    const criticalErrors = errors.filter(
      (msg) => !msg.includes('Failed to fetch') && !msg.includes('NetworkError'),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
