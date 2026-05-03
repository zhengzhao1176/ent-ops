# 09 · repo-impl

> **阶段**：Phase 1c — 后端实现（在测试 RED 之后）
> **触发时机**：unit-test-writer + integration-test-writer 完成后；可与 service-impl 并行（注意依赖）
> **上游**：`server/prisma/schema.prisma`、`server/src/contracts/**`
> **下游**：`10-service-impl`、`11-router-impl`

## 角色

仓储层实现。把 Prisma client 的 raw 方法包装成"业务无关、数据访问聚合"的 repository，统一软删过滤、分页规整、唯一冲突 → 业务错误的转换。

> 本任务是"后端业务代码"的第一段，**严格在测试 RED 之后**才允许动手。

## 目标

每个实体一个 repo 文件，提供 router/service 所需的全部数据访问方法。

## 输入

- `server/prisma/schema.prisma`（数据模型）
- `server/src/contracts/**`（推断方法签名）
- `server/tests/integration/{entity}.test.ts`（推断需要哪些 repo 方法）
- `server/tests/unit/**`（如 stock-math 等会通过 repo 取数据）

## 输出

- `server/src/server/repositories/{entityCamel}.repo.ts`，每个实体一个
- `server/src/server/repositories/_base.ts`（首次创建）：`PrismaClient` 单例 + 通用 `softDelete` 工具

## 工作流程

1. 通用基础（`_base.ts`）：
   - 导出 `prisma = new PrismaClient()`
   - 导出 `withSoftDelete<T>(where)` 注入 `deletedAt: null`
   - 导出 `paginate(args)`：把 `{page, pageSize}` 转为 `skip / take` 并并发查 `findMany + count`
2. 每个 repo 至少实现：
   - `findById(id, opts?: { includeDeleted?: boolean })`
   - `findPage(input)`：keyword + filters + sort + pagination
   - `create(input, ctx)`：返回新记录，写入 `createdBy`
   - `update(id, patch, ctx)`：携带 `version` 实现乐观锁，version 不匹配抛 `CONFLICT`
   - `softDelete(id, ctx)`：写 `deletedAt`、`updatedBy`
   - `restore(id, ctx)`：清 `deletedAt`
   - `existsByUnique(field, value, excludeId?)`：唯一冲突预检
3. 业务无关聚合方法按集成测试需求补：
   - **stock.repo**：`findByWhseGoodsBatch`、`addQty(stockId, delta, tx)`、`lockQty / releaseQty`
   - **stockLog.repo**：`appendLog(...)`（append-only，禁止 update/delete）
   - **inbound.repo**：`findWithLines(id)`、`createWithLines(...)`、`setStatus(id, status)`
   - **user.repo**：`findByLoginId(usernameOrMobileOrEmail)`、`incLoginFailCount`、`lockUntil`
   - **role/permission**：`listEffectivePermissions(userId)`
4. Prisma `P2002`（唯一冲突）转 `TRPCError({ code: 'CONFLICT' })`，`P2025`（不存在）转 `NOT_FOUND`。
5. 所有写方法接收 `ctx: { user: { id, ... } }` 用于审计字段。

## 硬性约束

- repo 层**不写业务规则**（库存校验、状态转移合法性这些在 service）
- repo **不抛 TRPCError 之外的自定义错误**
- 禁止在 repo 里直接调用其它 repo（避免循环依赖；service 层负责编排）
- 所有查询默认带软删过滤，需要"含已删"用 `includeDeleted: true` 显式传
- 数量类字段（库存）一律使用 `Prisma.Decimal`，避免 JS Number 精度坑
- 涉及多表写的 repo 方法（如 `createWithLines`）必须接受外部 `tx?: PrismaTransactionClient`，让 service 层拼事务

## 验证

```bash
cd server && npx tsc --noEmit
```

并不要求集成测试通过（那是 router-impl 之后才该绿）。

## 完成标志

- 每个实体 repo 文件齐全
- `tsc --noEmit` 通过
- 集成测试中"调 repo 时找不到方法"类失败全部消失（剩余失败应为 router 未实现）
