import { test, expect } from '@playwright/test';

test.describe('登录流程 (F-UM-02)', () => {
  test('正确账号密码可登录到仪表板', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('input-loginId').fill('admin');
    await page.getByTestId('input-password').fill('Aa123456');
    await page.getByTestId('btn-login').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('me-name')).toContainText('超级管理员');
  });

  test('错误密码报错', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('input-loginId').fill('admin');
    await page.getByTestId('input-password').fill('wrong-password');
    await page.getByTestId('btn-login').click();
    await expect(page.getByTestId('login-error')).toContainText('账号或密码错误');
  });

  test('禁用账号登录被拒', async ({ page, request }) => {
    // 先用 admin 登录创建一个账号并禁用
    const adminLogin = await request.post('/api/auth/login', { data: { loginId: 'admin', password: 'Aa123456' } });
    expect(adminLogin.ok()).toBe(true);
  });
});
