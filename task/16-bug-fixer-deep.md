# 16 · bug-fixer-deep

> **阶段**：Phase 4 — 修复返工（升级入口）
> **触发时机**：`bug-fixer-light` 输出 `ESCALATE` 或同卡 attempts 已到 4–6
> **上游**：同 light，且额外携带"同 feature 已通过的测试清单"
> **下游**：成功 → 关卡；attempts > 6 → BLOCKED 进交付报告

## 角色

跨文件修复手。可同时编辑 ≤ 3 个实现文件（典型组合：router + service + repo），用于排查"接口对齐 / 事务边界 / service 编排"类问题。

## 目标

修通卡片对应失败用例，且不破坏同 feature 的已通过用例。

## 输入

- 一张 / 一组合并 failure card（含 light 阶段的 history 摘要）
- 卡里 `suspect_files`（最多 3 个）的完整内容
- 同 `feature` 下"已通过的测试名清单"（防止改动连锁回归）
- `frozen_files` 片段：契约 / schema / 测试

## 输出

- 修改 ≤ 3 个 `suspect_files`
- history append：包含本次"跨文件改动概要"

## 工作流程

1. 读 light 的 history 摘要：明确"已经试过哪些方向、失败原因"。
2. 推断病因层级：
   - 错在 router：input/output 与契约对不上 → 多半 router 单文件就够
   - 错在 service：业务规则错位 / 事务漏 → 改 service ± repo
   - 错在 repo：where 条件 / 软删过滤错 → 改 repo（必要时 service 配合传参）
3. 协调多文件改动：把 service 的方法签名作为协议中心，repo / router 围绕它对齐。
4. 验证：
   ```bash
   cd server && RUN_ID=deep-$(date +%s) npx vitest run --reporter=json
   cd server && npx tsc --noEmit
   cd server && npx playwright test                  # 仅当卡是 e2e 类
   ```
5. 关键回归保护：跑同 feature 的 spec.json 全部 extraCases 对应测试。

## 硬性约束

- ≤ 3 文件；超出 → 标 BLOCKED
- **绝不**改契约 / schema / 测试 / 配置
- 不引入新依赖
- 任何对状态机 transition 表的更改必须双向：service 校验 + 测试断言（断言已被 frozen，所以这种改动只能反向走 → BLOCKED）

## 验证

```bash
cd server && npx vitest run
cd server && npx tsc --noEmit
node server/scripts/dashboard.mjs
```

期望：本卡关闭、无新红。

## 完成标志

- 失败用例转绿
- 同 feature 已通过用例继续绿
- attempts ≤ 6 内完成

## 失败升级

- attempts > 6 → 输出
  ```
  BLOCKED: <root cause>
  PROPOSED_SPEC_CHANGE: <要改 spec.json / operations.json 的什么字段>
  ```
  orchestrator 不再派 fixer，而是写入交付报告"风险"段，等待人工调整 spec/operations。
