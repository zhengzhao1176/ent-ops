# 13 · e2e-test-writer

> **阶段**：Phase 2b — 前端测试（**在 UI 实现之后**）
> **触发时机**：ui-impl 完成且 `next build` 通过后
> **上游**：`server/domain/flows.json`、`server/src/app/**`（已写好的页面与 `data-testid`）
> **下游**：`14-test-runner`

## 角色

端到端测试写作者。读 `flows.json` 中的步骤 DSL，按 Playwright 风格在浏览器里逐步执行；同时按各种"角色 × 流程"组合补出权限隔离类用例。

> **顺序约定**：用户明确"前端先写代码、再写测试"。本任务**不**驱动 UI 实现（不在 UI 写之前写 e2e），而是验收 UI。

## 目标

为每条 flow 写出一份 Playwright spec，并对核心反例（无权限、库存不足、状态非法）补充对照用例；最终 e2e 套件能在 CI 内一次跑全。

## 输入

- `server/domain/flows.json`：每条 flow 的 step 列表
- `server/domain/spec.json`：`kind: "e2e"` 的 extraCases
- `server/src/app/**`：UI 页面与组件，确认 `data-testid` 存在
- `server/tests/fixtures/setup-roles.ts`（首次创建）：登录态持久化（每个角色一份）

## 输出

- `server/tests/e2e/{flowCode}.spec.ts`，每条 flow 一个
- `server/playwright.config.ts`（首次创建）：
  - 项目分组按 role；`storageState` 复用登录态
  - retries: 1；trace: 'retain-on-failure'；video: 'retain-on-failure'
- `server/tests/fixtures/setup-roles.ts`：登录每个角色 → 把 cookie 落到 `.test-state/<role>.json`

## 工作流程

1. 配置 Playwright + 启动 Next dev/preview server。
2. 写 fixtures：
   - `globalSetup`：清测试库 → 跑迁移 → seed 各角色账号（superAdmin, sysAdmin, whMgr, whOp, purchaser, sales, auditor）→ 用账号密码登录 → `context.storageState({ path: '.test-state/<role>.json' })`
3. 对每条 flow 一个 `spec.ts`：
   - `use({ storageState: '.test-state/{flow.role}.json' })`
   - 把 step DSL 翻成 Playwright 调用：
     | DSL action | Playwright |
     |---|---|
     | navigate | `await page.goto(to)` |
     | click | `await page.getByTestId(target).click()` |
     | fill | `await page.getByTestId(target).fill(value)` |
     | select | `await page.getByTestId(target).selectOption(value)` |
     | upload | `await page.getByTestId(target).setInputFiles(path)` |
     | expect.toast | `await expect(page.getByRole('status')).toContainText(text)` |
     | expect.row | `await expect(page.getByTestId(in).getByText(matchVal)).toBeVisible()` |
     | expect.value | `await expect(page.getByTestId(target)).toHaveValue(text)` |
     | expect.url | `await expect(page).toHaveURL(text)` |
     | wait.navigation | `await page.waitForURL(text)` |
     | wait.request | `await page.waitForResponse(r => r.url().includes(text))` |
4. 反例补丁（每条 flow 至少 1 条）：
   - 用低权限角色重跑 → 关键按钮 disabled / 跳 `/403`
   - 出库流程：可用库存为 0 → 提交时 toast 报"库存不足"且单据未生成
   - 状态机：尝试非法 transition（如直接从草稿到已完成）→ 报错且按钮 disabled
5. 数据稳定性：
   - 每个 spec 内自给自足（建必要数据 → 操作 → 校验 → 清理）
   - 唯一字段用 `${test.info().title}-${Date.now()}` 防撞
6. 失败 artifact：失败时自动留 trace.zip + screenshot 到 `reports/runs/<id>/playwright-traces/`

## 硬性约束

- **必须用 `data-testid`** 选择器；禁 `.btn-primary` / `text=保存` 等脆弱选择器
- 单个 spec ≤ 200 行；单条 flow > 200 行 → 拆"准备数据"为单独 fixture
- 禁 `test.skip / test.only`
- 不允许在 e2e 里做"绕开 UI 直调 API 加数据"的捷径，**除了**纯准备 seed（用 fixture）；正向校验路径必须走 UI
- 不允许 hard-coded sleep；用 `expect.toPass` / `waitFor*` 显式条件等待

## 验证

```bash
cd server && npm run build
cd server && npx playwright install --with-deps   # 首次
cd server && RUN_ID=e2e-$(date +%s) npx playwright test --reporter=json,html \
  > reports/runs/$(date +%s)/playwright.json
```

期望：所有 flow 用例 GREEN（若 RED 则进入 14-test-runner 的 failure card 流程）。

## 完成标志

- `flows.json` 中每条 flow 至少 1 个 spec
- `spec.json` 中每条 `kind: "e2e"` extraCase 一对一映射到 `test()`
- 全套 e2e 在本地一次跑成绿
- `setup-roles.ts` 与 `playwright.config.ts` 写入完成

## 失败升级

- 选择器找不到 → 不改 spec，回 ui-impl 给元素补 `data-testid`
- 业务断言不通过且后端返回正确 → 回 ui-impl 修页面渲染
- 业务断言不通过且后端返回错误 → 提交 failure card 给 14-test-runner
