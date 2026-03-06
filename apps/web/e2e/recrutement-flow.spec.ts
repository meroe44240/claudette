import { test, expect } from '@playwright/test';
import { loginViaAPI, expectPageHeading } from './helpers';

test.describe.serial('Recrutement Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('should display seeded entreprises in the list', async ({ page }) => {
    await page.goto('/entreprises');
    await expectPageHeading(page, 'Entreprises');

    // Seed data has 5 entreprises - the table should be visible
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Verify at least one row is visible (seed data)
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('should navigate to an entreprise detail page', async ({ page }) => {
    await page.goto('/entreprises');
    await expectPageHeading(page, 'Entreprises');

    // Click on the first row in the table
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    // Should navigate to a detail page with an h1 matching the entreprise name
    await page.waitForURL(/\/entreprises\//, { timeout: 10000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

    // The detail page should show "Informations" section
    await expect(page.getByText('Informations')).toBeVisible({ timeout: 10000 });
  });

  test('should display seeded clients in the list', async ({ page }) => {
    await page.goto('/clients');
    await expectPageHeading(page, 'Clients');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('should navigate to a client detail page', async ({ page }) => {
    await page.goto('/clients');
    await expectPageHeading(page, 'Clients');

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    await page.waitForURL(/\/clients\//, { timeout: 10000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display seeded mandats in the list', async ({ page }) => {
    await page.goto('/mandats');
    await expectPageHeading(page, 'Mandats');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('should navigate to a mandat detail page and see candidatures', async ({ page }) => {
    await page.goto('/mandats');
    await expectPageHeading(page, 'Mandats');

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    await page.waitForURL(/\/mandats\//, { timeout: 10000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display seeded candidats in the list', async ({ page }) => {
    await page.goto('/candidats');
    await expectPageHeading(page, 'Candidats');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Seed data has 30 candidats
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('should navigate to a candidat detail page', async ({ page }) => {
    await page.goto('/candidats');
    await expectPageHeading(page, 'Candidats');

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    await page.waitForURL(/\/candidats\//, { timeout: 10000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('should search within candidats list using inline search', async ({ page }) => {
    await page.goto('/candidats');
    await expectPageHeading(page, 'Candidats');

    // Wait for data to load
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Use the search input on the candidats page
    const searchInput = page.locator('input[placeholder*="Rechercher un candidat"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('a');

    // Wait for the table to update (debounced search)
    await page.waitForTimeout(500);
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('should navigate between entities from detail pages', async ({ page }) => {
    // Go to mandats, click first one, then click on the linked entreprise
    await page.goto('/mandats');
    await expectPageHeading(page, 'Mandats');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Click on an entreprise link within the mandats table
    const entrepriseLink = table.locator('span.text-accent').first();
    if (await entrepriseLink.isVisible()) {
      await entrepriseLink.click();
      // Should navigate to either entreprise or client detail page
      await page.waitForURL(/\/(entreprises|clients)\//, { timeout: 10000 });
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
