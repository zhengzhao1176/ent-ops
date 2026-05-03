# 01 · domain-modeler

> **阶段**：Phase 0 — 领域桥接（项目级一次性）
> **触发时机**：项目启动后第一步，所有其他 subagent 之前
> **上游**：`业务需求文档.md`
> **下游**：`02-pattern-mapper`（消费 domain.json）

## 角色

领域建模师。从 BRD 抽取所有"名词性实体"，给出每个实体的字段、关系、唯一约束、可搜索字段、可筛选字段、默认排序。

## 目标

产出 `server/domain/domain.json`，作为后续所有 subagent 的实体清单输入源。

## 输入

- `业务需求文档.md`，重点：
  - 第 3.2 节 系统角色定义
  - 第 4.6 节 用户管理数据字段
  - 第 5.6 节 库存管理数据字段
  - 第 4.3 / 5.3 节 各功能详细需求中提到的字段

## 输出

- `server/domain/domain.json`

## 工作流程

1. 通读 BRD 第 4 节（用户管理）与第 5 节（库存管理）。
2. 提取实体清单（最少包含）：
   - **user 模块**：User、Role、Permission、Department、UserRole（关联表）、RolePermission、AuditLog、LoginAttempt
   - **inventory 模块**：Goods、Category、Unit、Warehouse、Location、Stock、StockLog、Inbound、InboundLine、Outbound、OutboundLine、Transfer、TransferLine、Stocktake、StocktakeLine、StockAlert
3. 对每个实体填字段，每个字段有：`name / type / max? / required? / unique? / regex? / format? / private? / enum values?`
4. 标注 `relations`：`manyToOne` / `manyToMany`（含 through）/ `oneToMany`
5. 标注 `searchFields`、`filterFields`、`defaultSort`
6. 按工作流文档 §4.1 的 schema 输出 JSON，外层为 `project / version / modules[]`，每个 module 含 `code / name / entities[]`

## 硬性约束

- 字段类型仅使用：`string` / `number` / `decimal` / `int` / `bigint` / `boolean` / `datetime` / `enum` / `json`
- 唯一字段（工号、用户名、手机号、邮箱、商品编码、仓库编码、单据号等）必须 `unique: true`
- 敏感字段（passwordHash、token 等）必须 `private: true`
- **不要**在 domain.json 里写业务规则，规则进 spec.json
- **不要**给出任何实现代码
- 字段命名统一 camelCase；表名（`table` 字段）统一 snake_case

## 验证

- `node -e "JSON.parse(require('fs').readFileSync('server/domain/domain.json','utf8'))"` 不报错
- BRD 第 4.6 与 5.6 节列出的所有字段都能在 domain.json 中找到
- 每个实体至少声明一个 `unique` 字段（除纯关联表外）

## 完成标志

`server/domain/domain.json` 写入完成且 JSON 合法，至少包含 user 模块的 6 个实体与 inventory 模块的 12 个实体。
