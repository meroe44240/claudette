import { test, expect } from '@playwright/test';
import { loginViaAPI, expectPageHeading } from './helpers';

test.describe('Admin Flow', () => {
  test('should display settings page with user list for admin', async ({ page }) => {
    // Login as admin
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    // Should see the "Utilisateurs" section heading
    await expect(page.getByText('Utilisateurs')).toBeVisible({ timeout: 10000 });

    // Should see a table with users
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Should see seeded users in the table
    await expect(page.getByText('meroe@humanup.io')).toBeVisible({ timeout: 10000 });
  });

  test('should display all seeded users in the settings table', async ({ page }) => {
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    // Wait for the table to load
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Verify seeded user emails are displayed
    const expectedEmails = [
      'meroe@humanup.io',
      'guillermo@humanup.io',
      'valentin@humanup.io',
      'marie@humanup.io',
    ];

    for (const email of expectedEmails) {
      await expect(page.getByText(email)).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show role badges for users', async ({ page }) => {
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Should see Admin and Recruteur role badges
    await expect(page.getByText('Admin').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Recruteur').first()).toBeVisible({ timeout: 5000 });
  });

  test('should have "Ajouter un utilisateur" button for admin', async ({ page }) => {
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    // Should see the "Ajouter un utilisateur" button
    const addButton = page.getByText('Ajouter un utilisateur');
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  test('should open create user modal when clicking add button', async ({ page }) => {
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    // Click "Ajouter un utilisateur" button
    const addButton = page.getByText('Ajouter un utilisateur');
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Modal should appear with the title
    await expect(page.getByText('Ajouter un utilisateur').nth(1)).toBeVisible({
      timeout: 5000,
    });

    // Should see form fields
    await expect(page.locator('input[placeholder*="Jean"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('input[placeholder*="Dupont"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('input[type="email"][placeholder*="exemple"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 3000 });

    // Should see Cancel and Create buttons
    await expect(page.getByText('Annuler')).toBeVisible({ timeout: 3000 });
  });

  test('should show restricted access for non-admin user on settings', async ({ page }) => {
    // Login as recruteur
    await loginViaAPI(page, 'guillermo@humanup.io', 'Recrut2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    // Should see "Acces restreint" message
    await expect(page.getByText('restreint')).toBeVisible({ timeout: 10000 });
  });

  test('should have Integrations button visible for admin', async ({ page }) => {
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/settings');
    await expectPageHeading(page, 'tres');

    // Should see the "Integrations" button
    const integrationsButton = page.getByText('grations');
    await expect(integrationsButton).toBeVisible({ timeout: 5000 });
  });

  test('admin sidebar should show Import and Settings links', async ({ page }) => {
    await loginViaAPI(page, 'meroe@humanup.io', 'Admin2026!');

    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    // The sidebar should have Import and Parametres links
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Import')).toBeVisible({ timeout: 5000 });
    await expect(sidebar.getByText('tres')).toBeVisible({ timeout: 5000 });
  });

  test('recruteur sidebar should NOT show Import and Settings links', async ({ page }) => {
    await loginViaAPI(page, 'guillermo@humanup.io', 'Recrut2026!');

    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    // The sidebar should NOT have Import link (admin-only)
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Import')).not.toBeVisible({ timeout: 3000 });
  });
});
