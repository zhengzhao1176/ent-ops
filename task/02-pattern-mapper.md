# 02 · pattern-mapper

> **阶段**：Phase 0 — 领域桥接
> **触发时机**：domain-modeler 完成之后
> **上游**：`01-domain-modeler` 产出的 `domain.json`
> **下游**：`03-flow-extractor` / `04-spec-author`，以及所有 Phase 1 实施类 subagent

## 角色

模式匹配师。读 `domain.json`，对每个实体决定应叠加哪些 Pattern（来自工作流文档 §2 模式目录），并枚举 Pattern 之外的"额外 procedure"（extras）。

## 目标

产出 `server/domain/operations.json`，规定每个实体跑哪些 Pattern Recipe 与 extras。

## 输入

- `server/domain/domain.json`
- 工作流文档 §2 模式目录（P-CRUD-FULL / P-CRUD-MASTER-DETAIL / P-CRUD-IMMUTABLE / P-CRUD-TREE / P-AUTH / P-RBAC / P-STATE-MACHINE / P-APPROVAL / P-BATCH / P-AUDIT / P-NOTIFICATION / P-LOOKUP / P-CONFIG / P-DASHBOARD / P-CRON）
- 工作流文档 §5 Pattern Recipe（用于校验 Pattern 是否可叠）

## 输出

- `server/domain/operations.json`

## 工作流程

1. 项目级 Pattern（不绑实体）：声明启用 P-AUTH、P-RBAC、P-AUDIT、P-NOTIFICATION、P-CRON、P-DASHBOARD。
2. 对每个实体按下表大致映射（也可基于实体特征自行判断）：
   | 实体类型 | 默认叠加 Pattern |
   |---------|----------------|
   | User / Goods / Warehouse / Location | P-CRUD-FULL + P-AUDIT + P-BATCH |
   | Department / Category | P-CRUD-TREE + P-AUDIT |
   | Role / Permission | P-CRUD-FULL + P-RBAC + P-AUDIT |
   | Inbound / Outbound / Transfer / Stocktake | P-CRUD-MASTER-DETAIL + P-STATE-MACHINE + P-AUDIT |
   | StockLog / AuditLog / LoginAttempt | P-CRUD-IMMUTABLE |
   | Stock | P-CRUD-READONLY + 自定义 mutation（出入库时被 service 调用） |
   | StockAlert | P-CRUD-READONLY + P-NOTIFICATION + P-CRON |
   | Unit | P-LOOKUP |
3. 对叠加了 P-STATE-MACHINE 的实体，在 `options` 中给出状态枚举（参考 BRD 第 11.1 节单据状态：10/20/30/40/90）与状态转移矩阵。
4. 对叠加了 P-CRUD-MASTER-DETAIL 的实体，在 `options.detailEntity` 指明从表名（如 Inbound→InboundLine）。
5. 对每个实体的 `extras` 列出 Pattern 之外的特化操作，至少覆盖：
   - User：`lockAccount`、`unlockAccount`、`resetPassword`、`activate`、`deactivate`、`changePassword`
   - Inbound/Outbound/Transfer：`audit`（审核）、`void`（作废）、`finish`（完成）
   - Stocktake：`freeze`（冻结）、`commit`（生成盘盈/盘亏单）
   - Stock：`reserve`（锁定）、`release`（解锁）
   - 每个 extras 项含 `name / kind(query|mutation) / specRef`，specRef 指向 BRD 中的功能编号（F-UM-XX / F-IM-XX）

## 硬性约束

- Pattern 编码必须出自工作流文档 §2 的目录，**不得自创**
- 同一实体可叠多个 Pattern，但禁止互斥组合（如 P-CRUD-IMMUTABLE 与 P-CRUD-FULL 同存）
- 每条 extras 必须有 `specRef`，便于 `spec-author` 反查
- 不要在 operations.json 里写实现细节

## 验证

- JSON 合法
- 所有 Pattern 编码在 §2 目录中存在
- 每个实体至少叠 1 个 Pattern

## 完成标志

`server/domain/operations.json` 写入完成；domain.json 中的每个实体在 operations.json 中都有对应条目。
