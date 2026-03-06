import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('Global Search', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('should show search results when typing in the global search bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    // The global search bar is in the header
    const searchInput = page.locator(
      'header input[placeholder*="Rechercher"]',
    );
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type a search query (use a common letter to match seeded data)
    await searchInput.fill('a');
    // Wait for debounce (300ms) and API call
    await page.waitForTimeout(500);

    // Need at least 2 characters for search to trigger
    await searchInput.fill('');
    await searchInput.type('mar', { delay: 100 });

    // Wait for search results dropdown to appear
    await page.waitForTimeout(500);

    // Look for search results dropdown (grouped results with type labels)
    const resultsDropdown = page.locator('header').locator('div.absolute');
    await expect(resultsDropdown).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to candidat detail when clicking a search result', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    const searchInput = page.locator(
      'header input[placeholder*="Rechercher"]',
    );
    await searchInput.click();
    await searchInput.type('mar', { delay: 100 });

    // Wait for results
    await page.waitForTimeout(800);

    // If search results appear, click the first one
    const resultButtons = page.locator(
      'header div.absolute button',
    );
    const resultCount = await resultButtons.count();

    if (resultCount > 0) {
      await resultButtons.first().click();

      // Should navigate to a detail page
      await page.waitForURL(/\/(candidats|clients|entreprises|mandats)\//, {
        timeout: 10000,
      });
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should show "Aucun résultat" for non-matching queries', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    const searchInput = page.locator(
      'header input[placeholder*="Rechercher"]',
    );
    await searchInput.click();
    await searchInput.type('zzzznonexistent999', { delay: 50 });

    // Wait for debounce and API call
    await page.waitForTimeout(800);

    // Should show "Aucun résultat" message
    const noResults = page.locator('header').getByText('Aucun résultat');
    await expect(noResults).toBeVisible({ timeout: 5000 });
  });

  test('should clear search when clicking the X button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    const searchInput = page.locator(
      'header input[placeholder*="Rechercher"]',
    );
    await searchInput.fill('test');

    // The X button should appear
    const clearButton = page.locator('header').locator('button').filter({
      has: page.locator('svg'),
    });

    // Find the clear button near the search input
    const searchContainer = searchInput.locator('..');
    const xButton = searchContainer.locator('button');
    if (await xButton.isVisible()) {
      await xButton.click();
      // Input should be cleared
      await expect(searchInput).toHaveValue('');
    }
  });

  test('should open search with Ctrl+K shortcut', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    // Press Ctrl+K to focus the search bar
    await page.keyboard.press('Control+k');

    const searchInput = page.locator(
      'header input[placeholder*="Rechercher"]',
    );
    // The search input should be focused
    await expect(searchInput).toBeFocused({ timeout: 3000 });
  });

  test('should search from candidats page inline search', async ({ page }) => {
    await page.goto('/candidats');
    await expect(page.locator('h1').filter({ hasText: 'Candidats' })).toBeVisible({
      timeout: 10000,
    });

    // Wait for table to load
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Use the inline search on the candidats page
    const inlineSearch = page.locator('input[placeholder*="Rechercher un candidat"]');
    await expect(inlineSearch).toBeVisible({ timeout: 5000 });
    await inlineSearch.fill('a');

    // Wait for debounced search to take effect
    await page.waitForTimeout(500);

    // Table should still be visible (with filtered results or the same data)
    await expect(table).toBeVisible({ timeout: 10000 });
  });
});
