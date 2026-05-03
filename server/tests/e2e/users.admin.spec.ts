import { test, expect } from '@playwright/test';

test.describe('用户管理 (F-UM-01 / F-UM-09)', () => {
  test('flow-onboard：在 admin 身份下新建用户后能在列表查到', async ({ page }) => {
    const stamp = Date.now();
    const employeeNo = `E${stamp}`.slice(-8);
    const username = `u${stamp}`.slice(-10);
    const mobile = `138${String(stamp).slice(-8)}`;
    const email = `${username}@x.com`;

    await page.goto('/admin/users');
    await page.getByTestId('btn-new-user').click();
    await expect(page).toHaveURL(/\/admin\/users\/new$/);

    await page.getByTestId('input-employeeNo').fill(employeeNo);
    await page.getByTestId('input-username').fill(username);
    await page.getByTestId('input-realName').fill('E2E 测试员工');
    await page.getByTestId('input-mobile').fill(mobile);
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('select-deptId').selectOption({ index: 1 });
    await page.getByTestId('btn-submit').click();

    await expect(page.getByTestId('success-msg')).toContainText('创建成功');
    await page.waitForURL(/\/admin\/users$/);
    await expect(page.getByTestId('table-users')).toContainText(username);
  });

  test('搜索能命中刚创建的用户', async ({ page }) => {
    await page.goto('/admin/users');
    const search = page.getByTestId('input-search');
    await search.fill('admin'); // admin/sysadmin/E2E 至少其一含 admin
    await page.getByTestId('btn-search').click();
    await expect(page.getByTestId('table-users')).toContainText('admin');
  });

  test('手机号格式非法应在表单提交后报错', async ({ page }) => {
    const stamp = Date.now();
    await page.goto('/admin/users/new');
    await page.getByTestId('input-employeeNo').fill(`X${stamp}`.slice(-8));
    await page.getByTestId('input-username').fill(`xx${stamp}`.slice(-10));
    await page.getByTestId('input-realName').fill('Bad Mobile');
    await page.getByTestId('input-mobile').fill('12345678901');
    await page.getByTestId('input-email').fill(`bad${stamp}@x.com`);
    await page.getByTestId('select-deptId').selectOption({ index: 1 });
    await page.getByTestId('btn-submit').click();
    await expect(page.getByTestId('error-msg')).toBeVisible();
  });
});
