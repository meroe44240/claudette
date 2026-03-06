import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Authentication', () => {
  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');

    // Verify login page is visible
    await expect(page.locator('h1')).toContainText('HumanUp');
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Fill in credentials
    await page.fill('input[type="email"]', 'meroe@humanup.io');
    await page.fill('input[type="password"]', 'Admin2026!');
    await page.click('button[type="submit"]');

    // Should redirect to the dashboard
    await expect(page).toHaveURL('/', { timeout: 15000 });
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'wrong@email.com');
    await page.fill('input[type="password"]', 'WrongPassword!');
    await page.click('button[type="submit"]');

    // Should stay on login page and show an error message
    await expect(page).toHaveURL('/login', { timeout: 5000 });
    await expect(page.locator('.text-error, [class*="error"], [class*="red"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Clear any existing session
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    });

    // Try to access a protected page
    await page.goto('/candidats');
    await expect(page).toHaveURL('/login', { timeout: 10000 });
  });

  test('should logout and redirect to login', async ({ page }) => {
    // First, login
    await login(page);

    // Verify we are on the dashboard
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });

    // Open the user dropdown (avatar button in the header)
    const avatarButton = page.locator('header button').filter({ has: page.locator('[class*="avatar"], span') }).last();
    await avatarButton.click();

    // Click the logout button in the dropdown
    const logoutButton = page.getByText('Déconnexion');
    await expect(logoutButton).toBeVisible({ timeout: 5000 });
    await logoutButton.click();

    // Should redirect to login page
    await expect(page).toHaveURL('/login', { timeout: 10000 });
  });

  test('should login as recruteur', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'guillermo@humanup.io');
    await page.fill('input[type="password"]', 'Recrut2026!');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/', { timeout: 15000 });
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({
      timeout: 10000,
    });
  });
});
