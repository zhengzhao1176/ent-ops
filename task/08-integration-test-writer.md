# 08 · integration-test-writer

> **阶段**：Phase 1b — 后端测试（先于实现）
> **触发时机**：contract-writer 完成后；可与 unit-test-writer 并行
> **上游**：`server/domain/{operations,spec}.json`、`server/src/contracts/**`、Pattern Test Scaffold
> **下游**：`11-router-impl`、`14-test-runner`

## 角色

集成测试写作者。**通过 tRPC server caller 直接调用 router**（不经 HTTP），打真实数据库（SQLite 内存或独立测试库），覆盖 14 条标准 CRUD 用例 + spec.json 的 integration extraCases。

> **TDD 强制规则**：本任务产出的测试在写完时必须**全部 RED**（无 router 实现时跑应失败）。

## 目标

每个实体一个集成测试文件，覆盖叠加 Pattern 自带的全部标准用例 + 业务规则增量。

## 输入

- `server/domain/operations.json`：实体 → Pattern 映射，决定要展开哪套标准用例
- `server/domain/spec.json`：`kind: "integration"` 的 extraCases
- `server/src/contracts/**`：契约（用于构造合法/非法 input）
- `server/tests/fixtures/db.ts`：测试数据库句柄 + serverCaller（不存在则本任务先创建）
- 工作流文档 §3.3 标准用例集（14 条 CRUD）

## 输出

- `server/tests/integration/{entityCamel}.test.ts`，每个实体一个
- `server/tests/fixtures/db.ts`（首次创建）：导出 `getCaller(role)`、`resetDb()`、`seedRole(role)`
- `server/tests/fixtures/factories/{entity}.ts`：合法 input 工厂（生成最小可建数据）

## 工作流程

1. 若 fixtures 不在，先建：
   - `db.ts`：每个 test `beforeEach` 创建独立 SQLite 内存库 + `prisma migrate deploy` + `seedRole`
   - `factories/`：用 `@faker-js/faker` 生成可重复（seeded）数据
2. 对每个实体，按其叠加 Pattern 展开标准用例（**动作粒度即 14 条，参考工作流文档 §3.3**）：
   - create：5 条（成功 / 唯一冲突 / 必填缺失 / 字段格式错 / 无权限）
   - read-list：6 条（默认分页 / keyword / 单 filter / 多 filter / sort / 软删过滤）
   - read-one：3 条（成功 / 不存在 / 软删 NOT_FOUND）
   - update：4 条（局部更新 / 乐观锁 / 唯一冲突 / 不存在）
   - delete：4 条（软删 / 软删后列表不可见 / 重复软删 / 关联约束）
   - restore：2 条（软删后恢复 / 未删时 BAD_REQUEST）
3. 对每条 spec.json `kind: "integration"` 的 extraCase 一对一写出 `it()`。
4. **使用 `protectedProcedure` 时模拟登录上下文**：用 fixtures 构造 `ctx.user`。
5. 错误断言用 `await expect(call).rejects.toMatchObject({ code: 'CONFLICT' })` 等。
6. 对状态机 entity，**全覆盖状态转移矩阵**：每个合法 transition 一条 ✓ 用例 + 每个非法 transition 一条 ✗ 用例。
7. 对 P-AUDIT 实体，每条写操作后断言 `auditLog` 表新增一条且字段正确。

## 硬性约束

- 测试名用中文 `it('注册时手机号重复应报 CONFLICT')`
- 每条 `it` 独立 reset DB；禁止依赖前一条用例的副作用
- **本阶段测试必须 RED**；不允许 mock router、不允许桩 service
- 禁止 `.skip / .only`
- 单文件 ≤ 600 行；超出按 procedure 拆文件（如 `user.create.test.ts`、`user.update.test.ts`）
- 不允许在 integration 测试里直接断 `localStorage` / DOM（那是 e2e 范畴）

## 验证

```bash
cd server && RUN_ID=red-integ npx vitest run tests/integration --reporter=json \
  > reports/runs/$(date +%s)/vitest-integration.json
```

期望：所有用例 RED；count = (实体数 × Pattern 标准用例数) + spec.json integration 数。

## 完成标志

- 所有实体集成测试文件齐全且全部 RED
- failure 原因均指向 router/service 未实现（NOT_FOUND on import / TRPCError 未抛 / undefined 等）
- fixtures/db.ts 与 fixtures/factories 可被复用
