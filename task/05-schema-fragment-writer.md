# 05 · schema-fragment-writer

> **阶段**：Phase 1a — 后端骨架（先于测试）
> **触发时机**：Phase 0 完成后；本 subagent 必须先于所有测试与实现 subagent
> **上游**：`server/domain/domain.json`、`server/domain/operations.json`
> **下游**：`06-contract-writer`、`09-repo-impl`，所有引用类型的测试 subagent

## 角色

数据模型片段写作者。读 `domain.json` 中某实体定义，按 Prisma schema 语法在 `server/prisma/schema.prisma` 追加 model 片段，包含字段、关系、索引、唯一约束。

> 说明：schema 与 contract 属于"类型骨架"，**不是**业务实现代码。它们必须在测试代码之前存在，否则测试无类型可引。这并不违反"后端先写测试"——后端业务逻辑（repo/service/router）仍然在测试之后写。

## 目标

将 `domain.json` 中所有实体落到 `server/prisma/schema.prisma`，可被 `prisma generate` 通过。

## 输入

- `server/domain/domain.json`
- 若存在共享模板：工作流文档 §3.1 Schema Hint
- Pattern 推荐字段：
  - **P-CRUD-FULL**：`id`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `version`
  - **P-CRUD-IMMUTABLE**：`id`, `createdAt`, `createdBy`（无 updatedAt/deletedAt）
  - **P-CRUD-TREE**：`parentId`, `path`, `depth`, `sort`
  - **P-STATE-MACHINE**：`status`, `statusUpdatedAt`, `statusUpdatedBy`
  - **P-AUDIT**：不动目标实体，新建 `AuditLog` 表

## 输出

- `server/prisma/schema.prisma`（追加，不覆盖已有 model）

## 工作流程

1. 检查 `server/prisma/schema.prisma` 是否已有 datasource / generator 块；没有就写：
   ```prisma
   generator client { provider = "prisma-client-js" }
   datasource db { provider = "sqlite" url = env("DATABASE_URL") }
   ```
2. 对每个实体，按其在 operations.json 中叠加的 Pattern，把对应推荐字段加上。
3. 关系字段：
   - manyToOne：`{Target} relName @relation(fields: [{field}Id], references: [id])`，外键 `{field}Id`
   - manyToMany：通过显式 through 表（如 `UserRole`）
   - oneToMany：在父侧声明 `{children} {Child}[]`
4. 索引：
   - 唯一字段 `@unique`
   - 外键字段 `@@index([fkId])`
   - 软删字段 `@@index([deletedAt])`
   - 状态字段 `@@index([status])`
5. 数值字段精度：库存数量类用 `Decimal` 并在注释里注明精度（参考 BRD `decimal(18,4)`）。SQLite 不原生支持 Decimal，落 `String` 时在 schema 注释标明，由 service 层做精度处理。

## 硬性约束

- 严禁创建 `server/domain/*` 之外的 JSON / 配置类文件
- 严禁修改已有 model（追加新 model 或追加字段需走 migration，本任务先聚焦初版生成）
- 表名遵循 `domain.json` 的 `table` 字段（snake_case），通过 `@@map`
- 字段名 camelCase，列名 snake_case，通过 `@map`
- `passwordHash` 等 private 字段必须存在，不可省略
- 不要在 schema 中写注释式业务规则（"// 必须 ≥ 0"），这些进 service / 测试断言

## 验证

```bash
cd server && npx prisma format
cd server && npx prisma validate
```

## 完成标志

- `server/prisma/schema.prisma` 通过 `prisma validate`
- domain.json 中每个实体在 schema 中都有对应 model
- 唯一/外键/状态索引齐备
