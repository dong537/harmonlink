import { expect, test } from '@playwright/test';

test('Customer 登录 → 余额页显示真实 wallet（非 0 占位）', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('customer.e2e@example.com');
  await page.locator('input[type="password"]').fill('Customer123!');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByText('钱包概览')).toBeVisible();
  await expect(page.getByText('321.45')).toBeVisible();
  await expect(page.getByText('CNY')).toBeVisible();
});

test('Customer 创建充值单 → 看到 PENDING 状态和单号', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('customer.e2e@example.com');
  await page.locator('input[type="password"]').fill('Customer123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto('/wallet/topup');
  await expect(page.getByText('创建充值单')).toBeVisible();
  await page.locator('input[role="spinbutton"]').fill('12.34');
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText('充值单已提交')).toBeVisible();
  await expect(page.getByText('PENDING')).toBeVisible();
  await expect(page.getByText('12.34 CNY')).toBeVisible();
});
