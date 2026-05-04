import { test, expect } from '@playwright/test';

// Deliberately broken spec to validate task/17-e2e-test-fixer.
// The login button testid is `btn-login` (see src/app/login/page.tsx),
// but this spec uses `btn-loginXXX` (typo). Fixer must detect & repair.

test.describe('登录流程（contrived broken — for e2e-test-fixer validation）', () => {
  test('正确账号密码可登录到仪表板', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('input-loginId').fill('admin');
    await page.getByTestId('input-password').fill('Aa123456');
    await page.getByTestId('btn-login').click(); // <-- intentional typo
    await expect(page).toHaveURL(/\/$/);
  });
});
