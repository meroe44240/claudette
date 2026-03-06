import { Page, expect } from '@playwright/test';

/**
 * Login via the UI by filling the login form and submitting.
 * After login, waits for the redirect to the dashboard (/).
 */
export async function login(
  page: Page,
  email = 'meroe@humanup.io',
  password = 'Admin2026!',
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await expect(page).toHaveURL('/', { timeout: 15000 });
}

/**
 * Login via the API to set localStorage tokens directly.
 * This is faster than UI login and useful for tests that do not test auth itself.
 */
export async function loginViaAPI(
  page: Page,
  email = 'meroe@humanup.io',
  password = 'Admin2026!',
) {
  const response = await page.request.post('http://localhost:3001/api/v1/auth/login', {
    data: { email, password },
  });
  const body = await response.json();
  const { accessToken, user } = body;

  // Set localStorage before navigating so the app picks up the session
  await page.goto('/login');
  await page.evaluate(
    ({ token, userData }) => {
      localStorage.setItem('accessToken', token);
      localStorage.setItem('user', JSON.stringify(userData));
    },
    { token: accessToken, userData: user },
  );

  await page.goto('/');
  await expect(page).toHaveURL('/', { timeout: 10000 });
}

/**
 * Wait for a page heading to be visible. Most pages use PageHeader with an h1.
 */
export async function expectPageHeading(page: Page, text: string) {
  await expect(page.locator('h1').filter({ hasText: text })).toBeVisible({ timeout: 10000 });
}
