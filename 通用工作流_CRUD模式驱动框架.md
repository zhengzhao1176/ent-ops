# 通用工作流：TDD + Subagent + CRUD 模式驱动框架

> **本文档定位：** 抽象成"任何 CRUD 类管理系统"都能套用的通用框架。
> **配套文档：**
> - `业务需求文档.md` 是本框架的**一份输入示例**（用户管理 + 库存管理 BRD）
> - 本文档是**框架本体**，含模式目录、Subagent 分工、测试反馈闭环；新项目从这里开始

---

## 0. 适用范围

### 0.1 ✅ 框架原生支持的场景

任何"中后台管理系统"，核心由以下能力组合而成：

| 类目 | 例子 |
|------|------|
| 主数据 CRUD | 用户、客户、商品、订单、合同、设备、资产、车辆 |
| 字典/枚举 | 行业、地区、类型、标签、状态码 |
| 树形结构 | 部门、菜单、分类、地理位置、组织架构 |
| 主从结构 | 订单-订单项、单据-明细、问卷-题目-选项 |
| 状态机 | 工单、审批、订单、合同、任务 |
| 审批流 | 请假、报销、采购、合同、变更 |
| 审计日志 | 操作记录、登录历史、数据变更 |
| 权限管理 | RBAC、数据权限、菜单/按钮/接口三级 |
| 认证 | 密码登录、邮箱/短信注册、找回密码、2FA |
| 批量操作 | 导入、导出、批量改、批量删 |
| 高级搜索 | 多条件、范围、模糊、保存搜索 |
| 报表 | 统计、聚合、时间序列、排行、导出 |
| 仪表板 | KPI 卡、趋势图、待办池 |
| 通知 | 站内信、邮件、短信、Webhook |
| 文件 | 上传、下载、预览、引用计数 |
| 配置 | 系统参数、特性开关、定时任务 |

**典型项目类型**：CRM、ERP、HR、OA、CMS、工单/客服、电商后台、库存/WMS、资产/IT 管理、教务/培训、医疗管理、政务系统等。

### 0.2 ⚠️ 需要在框架上扩展的场景

| 场景 | 扩展点 |
|------|--------|
| 实时通信（IM、协同编辑） | 引入 WebSocket / SSE 模块 |
| 复杂工作流引擎 | 引入 BPMN/状态机引擎库 |
| 大文件流处理 | 分片上传 + 对象存储适配器 |
| 多租户 SaaS | 加 tenant middleware（已有 pattern 草案） |
| AI/算法 | 业务侧调外部模型，不在本框架 |

### 0.3 ❌ 不适用

- 游戏、3D、视频处理、嵌入式
- 高频交易、低延迟撮合
- 纯计算密集型（科学计算、渲染）

---

## 1. 双层架构（核心抽象）

```
┌────────────────────────────────────────────────────────────┐
│  Layer A：通用框架层（Framework Layer）— 项目间复用            │
│  ─────────────────────────────────────────                  │
│  • 模式目录（Pattern Catalog）                                │
│  • 模式标准件（Schema/Contract/Test/Impl/UI 五件套模板）        │
│  • 参数化 Subagent 角色与 Prompt 模板                         │
│  • 测试反馈与返工闭环（见 §11）                                  │
│  • 项目骨架（Next.js + tRPC + SQLite + 配置文件）              │
└──────────────────────────┬─────────────────────────────────┘
                           │ 实例化
                           ▼
┌────────────────────────────────────────────────────────────┐
│  Layer B：领域桥接层（Domain Bridge Layer）— 每个项目自定义     │
│  ─────────────────────────────────────────                  │
│  • domain.json       ← 实体清单 + 字段                       │
│  • operations.json   ← 每个实体应用哪些 pattern               │
│  • flows.json        ← 跨实体的 E2E 用户流程                  │
│  • spec.json         ← 业务规则与测试用例（pattern 不能涵盖的）  │
└──────────────────────────┬─────────────────────────────────┘
                           │ 喂给
                           ▼
            Orchestrator（编排器）
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
        Subagents 群（按模式 recipe 自动派发）
            │              │              │
            ▼              ▼              ▼
        代码 + 测试（全部由模式生成，未涵盖的进 spec.json 单独处理）
```

**关键洞察**：

1. **80% 的代码是模式实例化的产物**（CRUD、列表分页、表单校验、审计日志）。
2. **15% 是模式组合的产物**（CRUD + 审批 + 状态机的复合体）。
3. **5% 才是真正的"业务定制代码"**，由 spec.json 驱动 + 单独的 custom subagent 处理。

把 95% 模式化，是这套框架能稳定跑且省 token 的根本原因。

---

## 2. 模式目录（Pattern Catalog）

> 模式 = 一段"做某类事情"的标准化套路。每个模式有唯一编码 `P-XXX`。
> 项目里凡是属于该模式的功能，都用同一组模板生成。

### 2.1 原子 CRUD 模式（8 个）

| 编码 | 名称 | tRPC 类型 | 默认 UI 组件 | 关键约束 |
|------|------|----------|-------------|----------|
| P-CREATE | 创建 | mutation | 表单 | 重复键校验、必填校验 |
| P-READ-ONE | 详情 | query | 详情页 | 软删过滤、权限校验 |
| P-READ-LIST | 列表 | query | 列表页（分页+排序+筛选） | 数据权限范围 |
| P-UPDATE | 局部更新 | mutation | 表单 | 乐观锁（version 字段） |
| P-DELETE | 软删除 | mutation | 确认弹窗 | 关联检查 |
| P-RESTORE | 恢复 | mutation | 按钮 | 仅软删态可恢复 |
| P-HARD-DELETE | 物理删除 | mutation | 二级确认 | 仅超管 + 已软删 |
| P-DUPLICATE | 复制新增 | mutation | 按钮 | 唯一字段需重新生成 |

### 2.2 组合模式（5 个）

| 编码 | 包含 |
|------|------|
| P-CRUD-FULL | CREATE + READ-ONE + READ-LIST + UPDATE + DELETE + RESTORE |
| P-CRUD-READONLY | READ-ONE + READ-LIST（用于报表、日志） |
| P-CRUD-IMMUTABLE | CREATE + READ-ONE + READ-LIST（用于审计、流水） |
| P-CRUD-MASTER-DETAIL | 主表 P-CRUD-FULL + 从表 CREATE/READ-LIST/DELETE（订单+订单项） |
| P-CRUD-TREE | 树节点 CRUD + 移动 + 排序 + 子树查询 |

### 2.3 业务模式（10 个）

| 编码 | 名称 | 包含的操作 | 适用场景举例 |
|------|------|-----------|-------------|
| P-AUTH | 认证 | register / login / logout / refresh / changePwd / resetPwd / verifyCode | 任何系统 |
| P-RBAC | 角色权限 | role-CRUD + permission 树 + 用户绑角色 + 数据权限 + check 接口 | 任何多角色系统 |
| P-STATE-MACHINE | 状态机 | createInState + transition + guard + 钩子 + listByState | 工单/订单/合同 |
| P-APPROVAL | 审批流 | submit / review / approve / reject / withdraw / 时间轴 | 请假/报销/采购 |
| P-BATCH | 批量 | batchCreate / batchUpdate / batchDelete / import-excel / export-excel | 任何 CRUD |
| P-SEARCH | 高级搜索 | 多字段 / 范围 / 模糊 / 保存搜索方案 | 数据量大的列表 |
| P-AUDIT | 审计 | 写操作自动落审计 + 查询接口 + diff 视图 | 合规/可追溯系统 |
| P-NOTIFICATION | 通知 | publish / 多渠道 / subscribe / markRead / list | 任何需要触达的系统 |
| P-FILE | 文件 | upload / download / preview / 引用计数 + 清理 | 含附件的系统 |
| P-REPORT | 报表 | 聚合 / 时间序列 / 排行 / 透视 / 导出 | 决策类系统 |

### 2.4 辅助模式（5 个）

| 编码 | 名称 |
|------|------|
| P-LOOKUP | 字典/枚举管理（多语言可选）|
| P-CONFIG | 系统配置（KV 模式 + 类型化读取）|
| P-DASHBOARD | 仪表板首页（卡片 + 图表 + 待办）|
| P-WEBHOOK | 外部事件订阅（订阅 / 重试 / 签名验证）|
| P-CRON | 定时任务管理（创建 / 启停 / 历史 / 手动触发）|

### 2.5 模式编号约定

```
P-XXX-YYY
├── 前缀 P：Pattern
├── 主码 XXX：模式大类（CRUD / AUTH / RBAC...）
└── 后缀 YYY（可选）：变体（FULL / READONLY / TREE）
```

新增模式时遵循此约定，避免冲突。

---

## 3. 模式标准件（每个 Pattern 的"5 件套"）

每个模式必须在框架中预定义以下 5 个工件，**这是模式可复用的物理形式**：

### 3.1 Schema Hint（推荐字段集）

每个模式给 entity 提建议字段。例：

| Pattern | 推荐字段 |
|---------|---------|
| P-CRUD-FULL | id, createdAt, updatedAt, deletedAt, createdBy, updatedBy, version |
| P-AUDIT (作为目标实体) | （不动实体本身，新建 AuditLog 表）|
| P-STATE-MACHINE | status (enum), statusUpdatedAt, statusUpdatedBy |
| P-APPROVAL | approvalStatus, currentNodeId, ApprovalLog 关联表 |
| P-CRUD-TREE | parentId, path (materialized path), depth, sort |
| P-FILE | fileKey, mimeType, size, refCount |
| P-RBAC (用户实体) | RoleBinding 关联表 |

### 3.2 Contract Skeleton（tRPC 类型骨架）

每个模式提供 Zod input/output 模板，用 `{{Entity}}` 占位。例（P-CRUD-FULL）：

```ts
// templates/patterns/P-CRUD-FULL.contract.tpl.ts
import { z } from 'zod';
import { Pagination, IdParam, Timestamps } from '../_shared';

export const {{entityCamel}}Contract = {
  list: {
    input: z.object({
      page: Pagination,
      keyword: z.string().optional(),
      filters: z.object({
        // {{filterFieldsZod}}  ← 由 codegen 替换
      }).partial().optional(),
      sort: z.object({ field: z.string(), order: z.enum(['asc','desc']) }).optional(),
    }),
    output: z.object({
      total: z.number(),
      items: z.array({{entityCamel}}Schema),
    }),
    type: 'query' as const,
  },
  detail: { input: IdParam, output: {{entityCamel}}Schema, type: 'query' as const },
  create: { input: {{entityCamel}}CreateSchema, output: {{entityCamel}}Schema, type: 'mutation' as const },
  update: { input: {{entityCamel}}UpdateSchema, output: {{entityCamel}}Schema, type: 'mutation' as const },
  delete: { input: IdParam, output: z.object({ ok: z.literal(true) }), type: 'mutation' as const },
  restore: { input: IdParam, output: {{entityCamel}}Schema, type: 'mutation' as const },
};
```

### 3.3 Test Scaffold（测试骨架，最重要的"省 token"利器）

每个模式定义一组**标准测试用例**，自动展开到每个 entity，**测试编写 subagent 只需要补 entity 特定字段，不需要重写测试逻辑**。

例（P-CRUD-FULL 的标准测试集，14 条 + 任何额外业务规则）：

```
[create]
  ✓ 正常创建后能在列表看到
  ✓ 唯一字段重复时报 CONFLICT
  ✓ 必填字段缺失时报 BAD_REQUEST + 字段名
  ✓ 字段超长/格式错时报 BAD_REQUEST
  ✓ 无权限用户报 FORBIDDEN

[read-list]
  ✓ 默认分页参数返回前 N 条 + total
  ✓ keyword 模糊匹配（按指定字段）
  ✓ filter 单条件命中
  ✓ filter 多条件 AND
  ✓ sort 按指定字段升序/降序
  ✓ 软删数据不出现在默认列表

[read-one]
  ✓ 存在记录返回完整对象
  ✓ 不存在 ID 报 NOT_FOUND
  ✓ 软删记录默认报 NOT_FOUND

[update]
  ✓ 局部更新只改传入字段
  ✓ version 不匹配报 CONFLICT（乐观锁）
  ✓ 唯一字段改成已存在值报 CONFLICT
  ✓ 不存在 ID 报 NOT_FOUND

[delete]
  ✓ 软删后 deletedAt 有值
  ✓ 软删后默认列表不可见
  ✓ 重复软删报 NOT_FOUND
  ✓ 关联约束（如有）报 CONFLICT + 提示

[restore]
  ✓ 软删后能恢复
  ✓ 未删除报 BAD_REQUEST
```

外加 **额外业务规则**（来自 spec.json），由 `integration-test-writer` subagent 拼接。**纯模式部分由模板自动生成，subagent 只补 spec 增量**。

### 3.4 Impl Skeleton（实现骨架）

每个模式给 repo / service / router 三层提供模板，subagent 填空式实现：

```ts
// templates/patterns/P-CRUD-FULL.router.tpl.ts
export function {{entityCamel}}Router(t: TRPCBuilder) {
  return t.router({
    list: t.protectedProcedure
      .input({{contract}}.list.input)
      .query(async ({ ctx, input }) => {
        return ctx.repos.{{entityCamel}}.findPage(input);
      }),
    detail: t.protectedProcedure
      .input({{contract}}.detail.input)
      .query(async ({ ctx, input }) => {
        const item = await ctx.repos.{{entityCamel}}.findById(input.id);
        if (!item) throw new TRPCError({ code: 'NOT_FOUND' });
        return item;
      }),
    // ... 其余 5 个标准 procedure
    // {{customProcedures}}  ← spec.json 里 entity 的 extras 在此插入
  });
}
```

### 3.5 UI Skeleton（默认页面）

每个模式提供 React 页面/组件模板：

```
P-CRUD-FULL 默认产出：
  src/app/{module}/{entity}/page.tsx        ← 列表页（含搜索/筛选/分页/批量按钮）
  src/app/{module}/{entity}/new/page.tsx    ← 新建表单
  src/app/{module}/{entity}/[id]/page.tsx   ← 详情/编辑
  src/components/{entity}/Form.tsx          ← 共用表单
  src/components/{entity}/Columns.tsx       ← 列定义
```

`ui-impl-{entity}` subagent 拿这套骨架，根据字段和业务规则补特化逻辑。

### 3.6 总结：5 件套带来的效果

| 工件 | 节省点 |
|------|--------|
| Schema Hint | schema-architect 不用从零设计常用字段 |
| Contract Skeleton | contract-writer 只填字段差异 |
| **Test Scaffold** | **integration-test-writer 80% 用例自动生成，只补 20% 业务规则** |
| Impl Skeleton | router-impl 只写业务分支 |
| UI Skeleton | ui-impl 只写表单字段和列定义 |

每个 entity 上 P-CRUD-FULL ≈ 600 行代码，其中模板生成 ~450 行，subagent 只产出 ~150 行差异代码。

---

## 4. Domain Bridge Layer（项目级配置）

每个新项目只写下面这几份 JSON，框架其余部分都不动。

### 4.1 `domain.json`（实体目录）

```jsonc
{
  "project": "demo-erp",
  "version": "1.0",
  "modules": [
    {
      "code": "user",
      "name": "用户管理",
      "entities": [
        {
          "code": "User",
          "name": "用户",
          "table": "users",
          "patterns": ["P-CRUD-FULL", "P-AUDIT", "P-BATCH", "P-RBAC"],
          "fields": [
            { "name": "username",  "type": "string",  "max": 64,  "unique": true,  "required": true },
            { "name": "mobile",    "type": "string",  "regex": "^1[3-9]\\d{9}$", "unique": true },
            { "name": "email",     "type": "string",  "format": "email", "unique": true },
            { "name": "passwordHash", "type": "string", "private": true },
            { "name": "status",    "type": "enum",    "values": ["PENDING","ACTIVE","DISABLED","LOCKED","DELETED"] }
          ],
          "relations": [
            { "type": "manyToOne",  "target": "Department", "field": "deptId" },
            { "type": "manyToMany", "target": "Role", "through": "UserRole" }
          ],
          "searchFields": ["username", "mobile", "email"],
          "filterFields": ["status", "deptId"],
          "defaultSort":  { "field": "createdAt", "order": "desc" }
        }
      ]
    },
    {
      "code": "inventory",
      "name": "库存管理",
      "entities": [ /* Goods, Warehouse, Stock, Inbound, Outbound, Transfer, Stocktake ... */ ]
    }
  ]
}
```

### 4.2 `operations.json`（pattern 应用 + 自定义操作）

```jsonc
{
  "User": {
    "patterns": [
      { "code": "P-CRUD-FULL" },
      { "code": "P-AUDIT" },
      { "code": "P-BATCH", "options": { "import": true, "export": true } }
    ],
    "extras": [
      { "name": "lockAccount",   "kind": "mutation", "specRef": "F-UM-07-LOCK" },
      { "name": "unlockAccount", "kind": "mutation", "specRef": "F-UM-07-UNLOCK" },
      { "name": "resetPassword", "kind": "mutation", "specRef": "F-UM-04-RESET" }
    ]
  },
  "Inbound": {
    "patterns": [
      { "code": "P-CRUD-MASTER-DETAIL", "options": { "detailEntity": "InboundLine" } },
      { "code": "P-STATE-MACHINE", "options": { "states": ["DRAFT","REVIEWING","APPROVED","DONE","VOID"] } },
      { "code": "P-AUDIT" }
    ],
    "extras": [
      { "name": "audit",   "kind": "mutation", "specRef": "F-IM-03-AUDIT" },
      { "name": "void",    "kind": "mutation", "specRef": "F-IM-03-VOID" }
    ]
  }
}
```

### 4.3 `flows.json`（跨实体业务流程，用于 E2E）

```jsonc
[
  {
    "code": "flow-onboard",
    "name": "新员工入职端到端流程",
    "role": "sysAdmin",
    "specRef": "F-UM-01 + F-UM-08",
    "steps": [
      { "action": "navigate", "to": "/admin/users" },
      { "action": "click",    "target": "btn-new-user" },
      { "action": "fill",     "target": "input-username", "value": "{{generated.username}}" },
      ...
      { "action": "expect",   "kind": "toast", "text": "创建成功" },
      { "action": "expect",   "kind": "row",   "in": "table-users", "match": { "username": "{{generated.username}}" } }
    ]
  },
  {
    "code": "flow-purchase-inbound",
    "name": "采购入库到库存可见",
    "role": "wh-mgr",
    "steps": [ /* 跨 Inbound + Stock 实体 */ ]
  }
]
```

### 4.4 `spec.json`（业务规则与额外测试用例）

只描述"模式覆盖不到的部分"。模式自带的 14 条标准 CRUD 用例不需要写。

```jsonc
{
  "F-UM-01-EXTRA": {
    "feature": "用户注册的额外业务规则",
    "patternBase": [{ "entity": "User", "pattern": "P-CRUD-FULL", "op": "create" }],
    "extraCases": [
      {
        "id": "C-001",
        "name": "首次登录强制改密",
        "given": "新建用户后用初始密码登录",
        "when": "尝试访问任何受保护页面",
        "then": "应被重定向到 /change-password"
      },
      {
        "id": "C-002",
        "name": "账号锁定后 30 分钟自动解锁",
        "given": "账号因密码错误 5 次被锁",
        "when": "等待 30 分钟",
        "then": "可正常登录"
      }
    ]
  }
}
```

---

## 5. Pattern Recipe（实例化规则）

> 每个 pattern 的"配方"明确规定：给定 entity X，应该派出几个 subagent 任务，每个任务的输入是什么、输出是什么。

### 5.1 Recipe: P-CRUD-FULL（每个实体一份）

```
Inputs needed:
  - entity definition (from domain.json)
  - schema fragment for related entities
  - relevant spec.json extras

Tasks generated (per entity):
  1.  schema-fragment-writer({entity})            → prisma/schema.prisma 追加片段
  2.  contract-writer({entity}, P-CRUD-FULL)      → src/contracts/{module}/{entity}.contract.ts
  3.  unit-test-writer({entity})                  → tests/unit/{entity}/*.test.ts (字段校验等)
  4.  integration-test-writer({entity}, P-CRUD-FULL) → tests/integration/{entity}.test.ts (含 14 标准用例 + extras)
  5.  e2e-test-writer({entity}-list-flow)         → tests/e2e/{entity}-crud.spec.ts
  6.  repo-impl({entity})                          → src/server/repositories/{entity}.repo.ts
  7.  service-impl({entity}) [可选]                → src/server/services/{entity}.service.ts (如有业务规则)
  8.  router-impl({entity}, P-CRUD-FULL)          → src/server/routers/{entity}.router.ts
  9.  ui-page-list-impl({entity})                 → src/app/{module}/{entity}/page.tsx
  10. ui-page-form-impl({entity})                 → src/app/{module}/{entity}/[id]/page.tsx
  11. ui-form-component-impl({entity})            → src/components/{entity}/Form.tsx

= 11 tasks per CRUD entity
```

### 5.2 Recipe: P-AUTH（项目级一份，不依赖 entity）

```
Tasks generated:
  - schema-add (User + Session + LoginAttempt)
  - contract-writer(auth)
  - unit-test (password-strength, jwt, rate-limit)
  - integration-test (register / login / refresh / changePwd / resetPwd / verifyCode)
  - e2e-test (login-flow, register-flow, forgot-pwd-flow)
  - service-impl (password.svc, session.svc, rateLimit.svc)
  - middleware-impl (authMiddleware)
  - router-impl (auth.router)
  - ui-impl × 4 pages (/login /register /forgot-password /reset-password)

= ~13 tasks (one-off per project)
```

### 5.3 Recipe: P-STATE-MACHINE（在某 entity 上叠加）

```
Inputs needed:
  - entity (already has P-CRUD-FULL)
  - state list + transition rules from operations.json options

Tasks generated (delta on top of P-CRUD-FULL):
  + schema-add: status enum + StatusTransitionLog table
  + contract-add: transition procedure(s)
  + integration-test-add: 状态转换矩阵全覆盖
  + service-impl: state-machine.svc (校验 transition 合法性)
  + router-add: transition mutation
  + ui-add: 状态徽章组件 + transition 按钮组

= +6 tasks delta
```

### 5.4 Recipe: P-APPROVAL（在某 entity 上叠加）

```
Tasks generated (delta):
  + schema-add: ApprovalLog table + approvalStatus / currentApproverId fields
  + contract-add: submit / approve / reject / withdraw + listMyTodo
  + integration-test-add: 审批链路 + 越权 + 撤回
  + service-impl: approval.svc + 审批节点路由
  + router-add: 审批 procedures
  + ui-add: 审批面板 + 时间轴

= +6 tasks delta
```

### 5.5 Recipe: P-BATCH（在某 entity 上叠加）

```
Tasks generated (delta):
  + contract-add: batchUpdate / batchDelete / importExcel / exportExcel
  + integration-test-add: 部分失败处理 / 错误行下载 / 大数据量
  + service-impl: import.svc (含 Excel 解析 + 字段映射 + 校验)
  + router-add
  + ui-add: 批量按钮 + 导入弹窗 + 错误清单

= +5 tasks delta
```

### 5.6 一个真实项目的任务总量估算

设：项目有 15 个实体，其中
- 10 个用 P-CRUD-FULL
- 5 个用 P-CRUD-FULL + P-STATE-MACHINE
- 3 个再叠 P-APPROVAL
- 8 个叠 P-BATCH
- 全项目用 P-AUTH + P-RBAC + P-AUDIT + P-NOTIFICATION

任务量：

| 模式 | 单位任务数 | 实例数 | 小计 |
|------|----------|--------|------|
| P-CRUD-FULL | 11 | 15 | 165 |
| P-STATE-MACHINE delta | 6 | 5 | 30 |
| P-APPROVAL delta | 6 | 3 | 18 |
| P-BATCH delta | 5 | 8 | 40 |
| P-AUTH | 13 | 1 | 13 |
| P-RBAC | 18 | 1 | 18 |
| P-AUDIT | 6 | 1 | 6 |
| P-NOTIFICATION | 8 | 1 | 8 |
| **合计核心实现** | | | **~298** |
| 加上修复轮次（按 30%）| | | **~390** |

约 **400 个 subagent 任务**，但每个 ≤ 8KB prompt + ≤ 8KB 输出，单 subagent 上下文极轻。

---

## 6. 参数化 Subagent 角色

把原文档里所有"绑定 user/inventory"的角色重命名为参数化形式：

| 角色 | 参数 | 输入 | 输出 |
|------|------|------|------|
| `domain-modeler` | BRD slice | BRD 段落 | domain.json fragment |
| `pattern-mapper` | domain.json | 实体清单 | operations.json |
| `flow-extractor` | BRD + operations | BRD 流程描述 | flows.json |
| `spec-author` | 业务规则段 + operations | BRD 规则 | spec.json |
| `schema-fragment-writer` | `{entity}` | entity def + 关联引用 | schema 片段 |
| `contract-writer` | `{entity, pattern}` | entity + 模式 contract 模板 | contract 文件 |
| `unit-test-writer` | `{entity, op}` | spec extras | 单测 |
| `integration-test-writer` | `{entity, pattern}` | 模板 14 条 + spec extras | 集成测试 |
| `e2e-test-writer` | `{flow}` | flow.json + page-map | E2E |
| `repo-impl` | `{entity}` | schema | repo |
| `service-impl` | `{entity, pattern}` | spec extras + repo 接口 | service |
| `router-impl` | `{entity, pattern}` | contract + service + 模板 | router |
| `ui-impl` | `{entity, page-type}` | UI 模板 + contract | page/component |
| `bug-fixer-light` | `{failure-card}` | failure card + 1 文件 | fix |

---

## 7. 通用 Prompt 模板（核心 4 个）

### 7.1 Pattern-aware Contract Writer

```markdown
# Role: tRPC Contract Writer

## Task
Generate the tRPC contract for entity **{{Entity}}** applying pattern **{{Pattern}}**.

## Inputs
1. Entity spec (extracted from domain.json):
   ```json
   {{entityJson}}
   ```
2. Pattern contract template:
   ```typescript
   {{patternContractTemplate}}
   ```
3. Custom procedures (from operations.json extras):
   ```json
   {{extras}}
   ```
4. Shared schemas: import from `src/contracts/_shared.ts`

## Output
Write to: `src/contracts/{{module}}/{{entityCamel}}.contract.ts`

## Rules
1. Replace `{{entityCamel}}`, `{{filterFieldsZod}}`, etc. in the template with concrete code derived from entity.fields
2. For each extra in operations.json, define an additional procedure with its own input/output Zod
3. Reference Pattern's standard schemas — DO NOT redefine
4. Mark fields with `private: true` as never appearing in output schemas

## Verification
`npx tsc --noEmit src/contracts/{{module}}/{{entityCamel}}.contract.ts`
Expected: no errors

## Done When
File written, tsc passes, list procedures generated.
```

### 7.2 Pattern-aware Integration Test Writer

```markdown
# Role: Integration Test Writer

## Task
Generate integration tests for entity **{{Entity}}** applying pattern **{{Pattern}}**.
The pattern contributes a **standard test suite** (auto-instantiated below).
You add **only the extra cases** specified in spec.json.

## Standard Suite (from pattern, copy verbatim with field substitution)
```typescript
{{patternStandardTestsTemplate}}
```

Substitutions to apply:
- `{{Entity}}` → {{Entity}}
- `{{uniqueField}}` → {{uniqueFieldFromEntity}}
- `{{requiredFields}}` → {{requiredFieldsList}}
- `{{searchField}}` → {{searchFieldFromEntity}}
- `{{filterField}}` → {{filterFieldFromEntity}}

## Extra Cases (from spec.json — write these ADDITIONALLY)
```json
{{extraCasesJson}}
```

## Inputs you may read
- `src/contracts/{{module}}/{{entityCamel}}.contract.ts`
- `tests/fixtures/db.ts`

## Output
Write to: `tests/integration/{{entityCamel}}.test.ts`

## Hard Constraints
- Test names in Chinese, e.g., `it('创建后能在列表查到')`
- 100% of standard suite cases included verbatim
- 100% of extra cases mapped 1:1 to `it(...)`
- DO NOT implement; tests should FAIL (RED phase)
- Use `serverCaller` from `tests/fixtures/db.ts`

## Verification
`RUN_ID=red npx vitest run tests/integration/{{entityCamel}}.test.ts`
Expected: every test fails (no impl yet); count = standard + extra count

## Done When
- File written, vitest reports correct test count, all RED
```

### 7.3 Pattern-aware Router Implementer

```markdown
# Role: tRPC Router Implementer

## Task
Implement router for entity **{{Entity}}** applying pattern **{{Pattern}}** so all its integration tests turn green.

## Inputs (READ-ONLY)
- Contract: `src/contracts/{{module}}/{{entityCamel}}.contract.ts`
- Integration test: `tests/integration/{{entityCamel}}.test.ts`
- Repository (already implemented): `src/server/repositories/{{entityCamel}}.repo.ts`
- Service (if present): `src/server/services/{{entityCamel}}.service.ts`
- Pattern impl skeleton (use as starting code):
  ```typescript
  {{patternRouterSkeleton}}
  ```

## Output
Write to: `src/server/routers/{{entityCamel}}.router.ts`

## Rules
1. Start from skeleton; replace `{{entityCamel}}` etc.
2. For extras (procedures not in pattern), write the body referencing service methods
3. Use `protectedProcedure`; declared `publicProcedure` only when entity spec marks it
4. All errors via `TRPCError` with explicit code
5. DO NOT touch contracts, tests, repo, service, schema

## Verification
1. `RUN_ID=g1 npx vitest run tests/integration/{{entityCamel}}.test.ts` → 100% pass
2. `RUN_ID=g2 npx vitest run` → no regression
3. `npx tsc --noEmit` → clean

## Done When
All three checks pass. Output diff line count.
```

### 7.4 Custom-spec Writer (for non-pattern features)

When BRD has features that **don't fit any pattern** (rare, ~5% of code), use a generic prompt:

```markdown
# Role: Custom Spec Implementer

## Task
Implement the feature specified by `{{specId}}` (a one-off, not pattern-driven).

## Spec
{{full spec.json entry}}

## Constraints
- File budget: ≤ 2 new files
- Must include: 1 unit test + 1 integration test (or 1 e2e if UI-only)
- Follow project conventions in `src/contracts/_shared.ts` and `tests/fixtures/`
- DO NOT modify existing contracts or tests

## Verification
Run all tests; new tests pass, no regression.
```

---

## 8. 适配新项目的 5 步指南

完整接入一个新项目的步骤：

### Step 1: 业务方写 BRD
任意结构（前面那份用户+库存 BRD 可作模板，但不强制结构）。

### Step 2: 跑 `domain-modeler`
> 输入：BRD 全文
> 输出：`domain.json`（实体清单 + 字段 + 关系）

prompt 大致是："把 BRD 里的所有名词性实体提取成 JSON，按附件 schema 输出"。

### Step 3: 跑 `pattern-mapper`
> 输入：`domain.json` + Pattern Catalog 速查表
> 输出：`operations.json`（每个实体应用的 pattern + 额外操作）

prompt：对每个 entity，参考其字段和 BRD 描述，从 Pattern Catalog 选 1～4 个 pattern。

### Step 4: 跑 `flow-extractor` + `spec-author`
> `flow-extractor`：从 BRD 提取跨实体业务流程 → `flows.json`
> `spec-author`：从 BRD 业务规则段提取 pattern 覆盖不到的额外用例 → `spec.json`

### Step 5: 启动 Orchestrator
> 一句话：「读 domain.json / operations.json / flows.json / spec.json，按 Pattern Recipes 派发任务，跑完整 TDD pipeline」

整个 Step 1 是人类工作（写 BRD），Step 2-5 完全是 AI 自动跑，**框架、模板、流程不变**。

---

## 9. 框架的"扩展点"（如何加新模式）

加一个新 Pattern 的标准操作（一次性工作）：

1. 在 `Pattern Catalog` 里登记编码 + 名称 + 描述
2. 写它的"5 件套"：
   - `templates/patterns/{P-XXX}.schema.hint.md`
   - `templates/patterns/{P-XXX}.contract.tpl.ts`
   - `templates/patterns/{P-XXX}.test.tpl.ts`（含标准用例集）
   - `templates/patterns/{P-XXX}.router.tpl.ts`
   - `templates/patterns/{P-XXX}.ui.tpl.tsx`
3. 写一份 Recipe（描述要派几个任务、每个任务输入输出）
4. 在 `operations.json` 的合法 pattern 集里加上它

完成后，所有项目都可以引用这个新 pattern。

**例**：要加 "P-IMPORT-EXCEL"（独立的 Excel 导入模式），写完上面 4 步即可全公司复用。

---

## 10. 覆盖度评估（修订版）

| 业务场景 | 框架原生支持 | 需要 spec.json 补充 | 需要新模式 |
|---------|-----------|--------------------|-----------|
| 用户/角色/部门管理 | ✅ 100% | — | — |
| 商品/订单/库存（标准 ERP）| ✅ 95% | 业务规则细节 | — |
| 工单系统 | ✅ 90% | 复杂派单算法 | — |
| 审批流（请假/报销）| ✅ 85% | 审批路由规则 | 复杂时加 P-WORKFLOW |
| 客户/合同管理 | ✅ 90% | 合同状态特化 | — |
| 内容管理（CMS）| ✅ 80% | 富文本编辑器 | P-CONTENT-VERSION |
| 预订/排期系统 | ✅ 70% | 时间冲突算法 | P-CALENDAR |
| 多租户 SaaS | ✅ 80% | 租户隔离规则 | P-MULTITENANT |
| 在线考试/题库 | ✅ 75% | 自动判分 | P-EXAM-ENGINE |
| 财务记账 | ✅ 60% | 复式记账规则 | P-LEDGER |
| IM / 协同编辑 | ⚠️ 30% | — | 需大量扩展 |
| 视频处理 / 大数据 | ❌ | — | 不在框架定位内 |

**结论**：80% 的中后台业务场景，本框架可覆盖 80%+ 的代码生成。剩下 20% 走 spec.json + custom-impl 路径，仍在 TDD 闭环内。

---

## 11. 测试反馈与返工闭环

> 解决的问题：测试报错怎么存、怎么切片、怎么以最小 token 喂给返工 subagent，让它精准修复而不读大日志。
> 该机制与领域无关，所有项目共用。

### 11.1 闭环全景（5 步）

```
[1] test-runner 跑测试，原始报告落盘
        │
        ▼
[2] slice-failures.mjs 把大报告切成 N 张"failure card"（每张 ≤ 2KB）
        │
        ▼
[3] orchestrator 读 failure card 索引，按文件归并 + 决策派单
        │
        ▼
[4] bug-fixer 收到「failure card + 可疑实现文件」自包含 prompt，改 1 个文件
        │
        ▼
[5] test-runner 仅重跑被修的测试 → 通过则关卡片，失败则 attempt+1 回到 [3]
```

**核心思想**：subagent 永远不读完整日志，只读专属于自己的"失败卡"。

### 11.2 报告存储目录结构

```
reports/
├── runs/
│   └── <时间戳_序号>/                ← 每次跑测试一个目录
│       ├── meta.json                  ← 这次跑的元信息
│       ├── stdout.log                 ← 原始 stdout/stderr（人类查问题用）
│       ├── vitest-unit.json           ← vitest --reporter=json
│       ├── vitest-integration.json
│       ├── playwright.json            ← playwright --reporter=json
│       ├── playwright-html/           ← html 报告（人类看）
│       └── playwright-traces/         ← 失败用例的 trace.zip + screenshot
│
├── failures/                          ← 切片后的失败卡（subagent 唯一输入源）
│   ├── _index.json                    ← 当前未关闭卡片清单
│   └── <feature>/<card_id>.card.json  ← ≤ 2KB / 张
│
├── history/                           ← 每张卡的修复历史（防死循环）
│   └── <card_id>.history.json
│
└── latest -> runs/<最新目录>          ← 软链
```

**命名约定**：`<test_kind>__<test_file_id>__<test_name_kebab>.card.json`
文件名即去重键 → 同一测试的下次失败**覆盖**而不堆积，自然形成"当前状态视图"。

### 11.3 Failure Card schema（≤ 2KB）

```jsonc
{
  "card_id": "integration__user.register__duplicate-mobile",
  "feature": "F-UM-01",
  "kind": "integration",                  // unit | integration | e2e
  "run_id": "2026-05-03T15-08-43_run-008",
  "attempt": 2,                            // 第几次返工
  "test": {
    "file": "tests/integration/user.router.test.ts",
    "line": 87,
    "name": "注册时手机号重复应报 CONFLICT 错误"
  },
  "failure": {
    "expected": "TRPCError { code: 'CONFLICT' }",
    "actual":   "TRPCError { code: 'BAD_REQUEST' }",
    "stack_trim": [                        // 仅项目内 frame，删 node_modules
      "src/server/routers/user.router.ts:34:11"
    ]
  },
  "context": {
    "suspect_files": ["src/server/routers/user.router.ts"],   // bug-fixer 可改
    "frozen_files":  ["src/contracts/user.contract.ts",       // 仅参考，禁改
                      "prisma/schema.prisma"],
    "test_file_excerpt": { "from_line": 84, "to_line": 102, "content": "..." }
  },
  "artifacts": {                           // 大文件只放路径，不内联
    "trace_zip": null,
    "screenshot": null,
    "stdout_excerpt_lines": [1230, 1278]
  },
  "history_ref": "history/<card_id>.history.json"
}
```

切片由工程内置的 `scripts/slice-failures.mjs` 完成（bootstrap-agent 一次性写好）。它读 vitest/playwright JSON 报告，按命名约定反查 `feature` 编号、推断 `suspect_files`、grep 出 `test_file_excerpt`。

### 11.4 报错怎么返回给 subagent 返工

**Orchestrator 决策表：**

```
读 reports/failures/_index.json
按 card 类型分流：

├── kind=unit + attempt ≤ 3              → bug-fixer-light    （改 1 个 service/repo 文件）
├── kind=integration + attempt ≤ 3       → bug-fixer-light    （改 1 个 router 文件）
├── kind=integration + attempt 4~6       → bug-fixer-deep     （可读 router + service + repo）
├── kind=e2e + 选择器问题                 → e2e-test-fixer     （改 spec，不改 src）
│       判定：actual 是 "selector not found / timeout"
├── kind=e2e + UI 业务断言失败             → ui-impl-fixer      （改 1 个 page/component）
├── kind=e2e + flaky                    → flake-detective    （读 trace.zip）
├── 编译错误（tsc 失败）                   → 拒收，回退到 writer 重写（见 §11.6）
└── attempt > 6                          → 标 BLOCKED，进交付报告"风险"段
```

**关键规则：**
- **同文件多卡合并派单**：`user.router.ts` 同时挂 5 张卡 → 派 1 个 fixer 一次解决，避免连锁回归
- **跨文件并行派单**：不同文件的卡同时派 fixer，互不干扰
- **History 摘要塞进新 prompt**：第 2 次返工时告诉 fixer "上次试了 X 但还红，原因是 Y，请换思路"

### 11.5 Bug-fixer 自包含 Prompt 模板

````markdown
# Role: Bug Fixer (Light)

## Your Task
There is/are {N} failing test(s) all pointing to ONE implementation file.
Make the test(s) pass by editing ONLY that file.

## The Single File You May Edit
Path: `{suspect_file_path}`
Current content:
```typescript
{paste full file content, ≤ 6KB}
```

## Frozen Files (READ for type/signature reference, DO NOT modify)
- `src/contracts/{contract_path}` ← 类型契约
- `prisma/schema.prisma` ← 数据模型
（仅相关片段粘贴在下方，若 < 1KB）

## Failing Test Card(s)
### Card 1 of {N}
- **Test:** `{test.name}` (line {test.line} of `{test.file}`)
- **Expected:** {failure.expected}
- **Actual:** {failure.actual}
- **Stack:** {stack_trim}
- **Test code excerpt:** ```{test_file_excerpt.content}```

### Previous Attempts (from history)
- attempt 1: tried "{edit_summary}" → {outcome}

## Hard Constraints
1. Edit ONLY `{suspect_file_path}`
2. Do NOT modify tests / contract / schema / config
3. Do NOT add `@ts-ignore`, `.skip`, `.only`
4. Do NOT add new dependencies — output `MISSING_DEP: <name>` if needed
5. Keep the file ≤ 300 lines

## Verification
```bash
RUN_ID=fix-$(date +%s) npx vitest run {test.file} --reporter=json
RUN_ID=fix-$(date +%s) npm run test:integration   # 确保无回归
```

## Done When
- Both verifications pass; output 3-line summary

## If You Cannot Fix
Output exactly: `ESCALATE: <one-line root cause that's outside this file>`
````

`bug-fixer-deep` 与 `light` 几乎相同，差异仅两点：① 可改文件从 1 扩到 ≤3；② 附加同 feature 的"通过测试"清单提醒不要破坏。

### 11.6 升级阶梯与特殊路径

| Attempt | Fixer | 可改文件 | Token 预算 | 触发条件 |
|---------|-------|----------|-----------|----------|
| 1～3 | bug-fixer-light | 1 个 | 8KB | 默认入口 |
| 4～6 | bug-fixer-deep | ≤ 3 个 | 15KB | light 输出 ESCALATE 或 3 次 STILL_RED |
| 7 | flake-detective（仅 e2e） | 1 个 | 20KB（含 trace 摘要） | E2E 间歇性失败 |
| 8+ | 写入交付报告 BLOCKED 段 | — | — | 仍未修复，人工介入（改 spec.json，不改代码） |

**两条特殊路径：**

1. **编译错（`tsc --noEmit` 失败）不进 failure card 流程。**
   它表明实现违反了契约——是 writer 的问题，不是 bug。orchestrator 直接拒收，回退到对应的 writer subagent 重写：
   ```
   tsc 错出现在 src/contracts/*  → contract-architect 返工
   tsc 错出现在 src/server/routers/* → 对应 router-impl 返工
   tsc 错出现在 src/app/*  → 对应 ui-impl 返工
   tsc 错出现在 tests/*  → 对应 test-writer 返工
   ```
   不让 bug-fixer 修编译错的原因：编译错往往意味着对契约的误解，让原 writer 重写比"打补丁"干净。

2. **E2E 持久化 state 失效（`.test-state/<role>` 损坏）不当 bug 处理。**
   test-runner 检测到"失败 ≥ 50% 且失败点都在登录后第一个断言"时，自动删 `.test-state/`、重跑 `tests/fixtures/setup-roles.ts` 重建，再跑一遍；仍失败才生成 failure card。

### 11.7 History 防死循环

每张卡都有一份 history，记录历次 attempt 的 fixer / 改动文件 / 编辑摘要 / outcome。**派单时 orchestrator 把过去 attempts 的 `edit_summary` 和 `outcome` 摘要塞进新 fixer 的 prompt**（"前面试过 X 但还红，原因是 Y，请换思路"），避免重复尝试无效改法。

### 11.8 给人类的可视化（dashboard）

`scripts/dashboard.mjs` 读 `reports/failures/_index.json` + `history/*.json` 输出一张表，**人类只看这张表**：

```
═══════════════════════════════════════════════════════════
  Run-008 — 2026-05-03 15:08
═══════════════════════════════════════════════════════════
  Phase     Pass/Total    Open Cards   Avg Attempts
  unit      187/187       0            —
  integ.    123/124       1 (F-UM-01)  1.0
  e2e        37/38        1 (F-IM-04)  2.5
═══════════════════════════════════════════════════════════
  OPEN CARDS
  [F-UM-01] integration__user.register__duplicate-mobile
            attempts=1, fixer=bug-fixer-light, age=2m
  [F-IM-04] e2e__flow-outbound__insufficient-stock-blocks
            attempts=3, fixer=bug-fixer-deep, age=15m
  BLOCKED: 0
═══════════════════════════════════════════════════════════
```

attempts 飙升或 BLOCKED 才介入——介入也不是改代码，是**改 `spec.json`**，触发该 feature 全链路重跑。

### 11.9 项目目录骨架（落地形态）

```
project-root/
├── framework/                       ← 复制自本框架，所有项目共享（可改 git submodule）
│   ├── patterns/                    ← 5 件套模板
│   ├── prompts/                     ← 通用 prompt 模板
│   ├── scripts/
│   │   ├── slice-failures.mjs       ← §11.3 切片脚本
│   │   ├── instantiate-tasks.mjs    ← 读 domain bridge + recipe → 生成 prompts/
│   │   └── dashboard.mjs            ← §11.8 状态表
│   └── README.md
│
├── domain/                          ← 项目特定（Domain Bridge Layer）
│   ├── domain.json
│   ├── operations.json
│   ├── flows.json
│   └── spec.json
│
├── prompts/                         ← 由 instantiate-tasks.mjs 自动产出
│   └── (数百个自包含 prompt)
│
├── prisma/                          ← schema.prisma
├── src/                             ← Next.js + tRPC 代码
├── tests/                           ← unit / integration / e2e
├── reports/                         ← §11.2 报告与失败卡
└── orchestrator.md                  ← 主对话 Claude 的入口指令
```

---

## 12. 一行总结

> **域 = (实体集 × 模式集) + 少量 spec 增量。**
> 把 80% 业务变成模式实例化，把 15% 变成模式组合，把 5% 用 spec 兜底。
> 一套框架、一套模板、一套 subagent 角色，跑遍所有 CRUD 类项目。

---

**—— 通用工作流框架文档结束 ——**
