# 14 · test-runner

> **阶段**：Phase 3 — 测试执行与失败切片
> **触发时机**：每次有"已写完"的测试或实现需要验证时；CI 与本地都用同一脚本
> **上游**：所有测试与实现 subagent
> **下游**：`15-bug-fixer-light` 起始的修复链路

## 角色

测试执行 + 失败切片调度器。**严格按"单元测试 → 集成测试 → 自动化（E2E）测试"顺序执行**，把每一段的 JSON 报告切成 ≤ 2KB 的 failure card，写入 `server/reports/failures/`，再触发 orchestrator 派单修复。

> **顺序约定**：用户明确"先跑完单元测试，最后再跑自动化测试"。本任务严格依此分阶段，**前一阶段未通过则不进入下一阶段**（除非显式 `--force-next`）。

## 目标

跑出一套可被 dashboard 与 bug-fixer 直接消费的失败卡集合，并保证测试历史可追溯。

## 输入

- `server/tests/unit/**`
- `server/tests/integration/**`
- `server/tests/e2e/**`
- `server/scripts/slice-failures.mjs`（首次创建；按工作流文档 §11.3 schema 切片）

## 输出

- `server/reports/runs/<时间戳_序号>/`：原始报告
  - `meta.json`、`stdout.log`
  - `vitest-unit.json`、`vitest-integration.json`、`playwright.json`、`playwright-html/`、`playwright-traces/`
- `server/reports/failures/`：切片后的 failure card
  - `_index.json`（当前未关闭卡片清单）
  - `<feature>/<card_id>.card.json`
- `server/reports/history/<card_id>.history.json`
- `server/reports/latest -> runs/<最新>`（软链）

## 工作流程

1. 准备阶段：
   - 生成 `RUN_ID = $(date +%Y-%m-%dT%H-%M-%S)_run-NNN`
   - `mkdir reports/runs/$RUN_ID && touch meta.json`
   - `meta.json` 含 git commit、分支、触发原因、本机环境
2. **第一段：单元测试（必须先跑完）**
   ```bash
   cd server && RUN_ID=$RUN_ID npx vitest run tests/unit \
     --reporter=json --outputFile=reports/runs/$RUN_ID/vitest-unit.json \
     --reporter=default 2>&1 | tee -a reports/runs/$RUN_ID/stdout.log
   ```
   - 失败 > 0 → 调 `slice-failures.mjs unit reports/runs/$RUN_ID/vitest-unit.json`
   - 默认 **STOP**：不进入下一段；如显式 `--continue-on-fail`，记到 meta.json 并继续
3. **第二段：集成测试**（仅当单元通过或 `--continue-on-fail`）
   ```bash
   cd server && RUN_ID=$RUN_ID npx vitest run tests/integration \
     --reporter=json --outputFile=reports/runs/$RUN_ID/vitest-integration.json \
     2>&1 | tee -a reports/runs/$RUN_ID/stdout.log
   ```
   - 同样失败切片 + 默认 STOP
4. **第三段：自动化（E2E）测试**（最后跑）
   ```bash
   cd server && npx playwright install --with-deps  # 仅首次
   cd server && RUN_ID=$RUN_ID npx playwright test \
     --reporter=json,html --output=reports/runs/$RUN_ID/playwright-traces \
     2>&1 | tee -a reports/runs/$RUN_ID/stdout.log
   ```
   - 把 JSON 重定向到 `playwright.json`
   - 切片：`slice-failures.mjs e2e ...`
5. 切片脚本职责（`slice-failures.mjs`）：
   - 解析 vitest/playwright JSON
   - 按 `<test_kind>__<file_id>__<test_name_kebab>.card.json` 命名（同测试再失败 → 覆盖，不堆积）
   - 反查 `feature` 编号（按测试 `describe` 名 / 文件路径推断 `F-UM-XX` / `F-IM-XX`）
   - 推断 `suspect_files`：
     - integration 失败 → 推断 router → service → repo
     - e2e 失败 → 推断对应 page / component
     - 错误信息含 "selector not found" → 标 `e2e-selector-issue`
   - grep 出 `test_file_excerpt`（失败行 ±10 行）
   - 写 history：append 一条 `{ run_id, attempt+1 }`
   - 更新 `_index.json`
6. 特殊路径（工作流文档 §11.6）：
   - **编译错（`tsc --noEmit` 失败）**：不进失败卡，直接退回到对应 writer subagent 重写（contract / router / ui / test）
   - **E2E `.test-state` 损坏**（失败率 ≥ 50% 且都在登录后第一断言）：删 `.test-state/` → 跑 `setup-roles.ts` → 重跑 e2e 一次；仍红才生成卡

## 硬性约束

- **三段顺序固化**：unit → integration → e2e，禁止并行；禁止颠倒
- 每段必须等上一段写完报告再开始
- 报告目录每次新增，不得覆盖历史
- failure card ≤ 2KB；超出则 trace/screenshot 只存路径
- 切片脚本对未识别的测试名要给出 `feature: "UNKNOWN"`，不能丢
- 永远不要在 test-runner 里"自动改代码"——只产报告与卡片

## 验证

```bash
test -f server/reports/latest/vitest-unit.json
test -f server/reports/latest/vitest-integration.json
test -f server/reports/latest/playwright.json
node server/scripts/dashboard.mjs   # 输出工作流文档 §11.8 风格的状态表
```

## 完成标志

- 三段都已跑（或在第一段失败时正确停在第一段）
- `_index.json` 反映当前所有 open card
- dashboard 命令输出可读

## 失败升级

- 切片脚本异常 → 拒绝产报告并报警，不能让 fixer 拿到坏卡
- 同一卡 attempts > 6 → 标 `BLOCKED`，写入交付报告"风险"段
