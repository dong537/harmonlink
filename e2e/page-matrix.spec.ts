import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PUBLIC_PAGES = [
  { name: 'home', url: '/' },
  { name: 'buy', url: '/buy' },
] as const;

const CUSTOMER_PAGES = [
  { name: 'overview', url: '/overview' },
  { name: 'buy', url: '/customer/buy' },
  { name: 'wallet', url: '/wallet' },
  { name: 'apiKeys', url: '/api-keys' },
  { name: 'proxies', url: '/proxies' },
  { name: 'proxyCheck', url: '/proxy-check' },
  { name: 'tickets', url: '/tickets' },
  { name: 'account', url: '/account' },
  { name: 'reseller', url: '/reseller' },
  { name: 'resellerUsers', url: '/reseller/users' },
  { name: 'resellerProducts', url: '/reseller/products' },
  { name: 'resellerPricing', url: '/reseller/pricing' },
  { name: 'resellerOrders', url: '/reseller/orders' },
] as const;

const ADMIN_PAGES = [
  { name: 'dashboard', url: '/admin/dashboard' },
  { name: 'users', url: '/admin/users' },
  { name: 'wallet', url: '/admin/wallet' },
  { name: 'payments', url: '/admin/payments' },
  { name: 'orders', url: '/admin/orders' },
  { name: 'providers', url: '/admin/providers' },
  { name: 'resources', url: '/admin/resources' },
  { name: 'pricing', url: '/admin/pricing' },
  { name: 'apiKeys', url: '/admin/api-keys' },
  { name: 'tickets', url: '/admin/tickets' },
  { name: 'tenants', url: '/admin/tenants' },
  { name: 'resellers', url: '/admin/resellers' },
  { name: 'site', url: '/admin/site' },
  { name: 'upstream', url: '/admin/upstream' },
  { name: 'audit', url: '/admin/audit' },
  { name: 'requestLogs', url: '/admin/request-logs' },
  { name: 'brand', url: '/admin/brand' },
] as const;

test.describe('page matrix smoke', () => {
  test('public pages render with stable first-screen content', async ({ page }) => {
    for (const entry of PUBLIC_PAGES) {
      await page.goto(entry.url);
      await expect(page).toHaveURL(new RegExp(`${entry.url === '/' ? '\\/$' : entry.url.replace(/\//g, '\\/')}$`));
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveScreenshot(`public-${entry.name}.png`, { fullPage: true });
    }
  });

  test('customer pages render after login', async ({ page }) => {
    await loginCustomer(page);
    for (const entry of CUSTOMER_PAGES) {
      await page.goto(entry.url);
      await expect(page).toHaveURL(new RegExp(`${entry.url.replace(/\//g, '\\/')}$`));
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveScreenshot(`customer-${entry.name}.png`, { fullPage: true });
    }
  });

  test('admin pages render after login', async ({ page }) => {
    await loginAdmin(page);
    for (const entry of ADMIN_PAGES) {
      await page.goto(entry.url);
      await expect(page).toHaveURL(new RegExp(`${entry.url.replace(/\//g, '\\/')}$`));
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveScreenshot(`admin-${entry.name}.png`, { fullPage: true });
    }
  });
});

async function loginCustomer(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('customer.e2e@example.com');
  await page.locator('input[type="password"]').fill('Customer123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function loginAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill('admin.e2e@example.com');
  await page.locator('input[type="password"]').fill('Admin123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin\/users$/);
}
