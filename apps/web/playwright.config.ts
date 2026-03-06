import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'cd ../api && npx tsx src/index.ts',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://humanup:humanup_dev@localhost:5432/humanup_test',
        JWT_ACCESS_SECRET: 'dev-access-secret-humanup-2026',
        JWT_REFRESH_SECRET: 'dev-refresh-secret-humanup-2026',
        API_PORT: '3001',
      },
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
