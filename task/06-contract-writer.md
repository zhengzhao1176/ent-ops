# 06 · contract-writer

> **阶段**：Phase 1a — 后端骨架（先于测试）
> **触发时机**：`05-schema-fragment-writer` 完成后；本 subagent 必须早于所有测试 subagent
> **上游**：`server/domain/{domain,operations}.json`、`server/prisma/schema.prisma`
> **下游**：`07-unit-test-writer`、`08-integration-test-writer`、`11-router-impl`、`12-ui-impl`

## 角色

tRPC 契约写作者。基于 entity + 叠加的 Pattern，产出 Zod 类型 + tRPC procedure 描述（input/output/type）。

> 说明：契约属于"接口骨架"，先于测试存在。后端业务实现（router/service/repo）仍然在测试之后写。

## 目标

每个实体一个 contract 文件，规定该实体所有 query / mutation 的 input / output 形状；测试与实现都以 contract 为唯一类型源。

## 输入

- `server/domain/domain.json` 中目标实体的字段定义
- `server/domain/operations.json` 中目标实体叠加的 Pattern + extras
- 工作流文档 §3.2 Contract Skeleton（按 Pattern 套模板）
- `server/src/contracts/_shared.ts`（共享 Zod：`Pagination`、`IdParam`、`Timestamps` 等；不存在则本任务负责创建）

## 输出

- 每个 entity 一个：`server/src/contracts/{module}/{entityCamel}.contract.ts`
- 共享：`server/src/contracts/_shared.ts`（首次创建）

## 工作流程

1. 若 `_shared.ts` 不存在，先建立，至少导出：
   - `Pagination = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(200).default(20) })`
   - `IdParam = z.object({ id: z.bigint().or(z.string().regex(/^\d+$/).transform(BigInt)) })`
   - `Timestamps`、`OkResp`、`SortInput` 等
2. 对每个实体，按 Pattern 模板组合 procedures：
   - **P-CRUD-FULL**：`list / detail / create / update / delete / restore`
   - **P-CRUD-IMMUTABLE**：仅 `list / detail / create`
   - **P-CRUD-READONLY**：仅 `list / detail`
   - **P-CRUD-MASTER-DETAIL**：在主表 CRUD 之上加 `addLine / removeLine / updateLine`
   - **P-CRUD-TREE**：加 `move / listChildren / listAncestors`
   - **P-STATE-MACHINE**：加 `transition`，input 含 `from / to / reason`
   - **P-BATCH**：加 `batchUpdate / batchDelete / importExcel / exportExcel`
3. 把 operations.json 中该实体的 `extras` 转成额外 procedure，每个有独立 input/output Zod。
4. **私有字段不出现在 output schema**（如 `passwordHash` 永不返回）。
5. 列表 input 自动从 entity.searchFields / filterFields 生成 Zod。
6. 全文导出对象 `{entityCamel}Contract`，并导出 `{Entity}Schema`（行级 Zod，可被前端复用）。

## 硬性约束

- 仅产出**类型与契约**，**不**写 procedure 实现
- 不在 contract 文件里 import Prisma client（保持纯 Zod，便于前端共享）
- 唯一字段、必填字段必须在 input schema 中体现
- 枚举字段用 `z.enum([...])`，与 schema.prisma 枚举一致
- 顶层 export 命名：`{entityCamel}Contract`、`{Entity}Schema`、`{Entity}CreateSchema`、`{Entity}UpdateSchema`

## 验证

```bash
cd server && npx tsc --noEmit -p tsconfig.json
```

期望：无错误。

## 完成标志

- 所有实体 contract 文件齐全
- `tsc --noEmit` 通过
- 列表 procedure 的 input 包含 page / pageSize / keyword / filters / sort
