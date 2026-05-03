# 测试驱动 + Subagent 极致分工开发工作流

> **配套 BRD：** `业务需求文档_用户与库存管理.md`
> **技术栈：** Next.js 15 (App Router) + tRPC v11 + Prisma + SQLite + TypeScript + Vitest + Playwright
> **核心信条：** 人类只看测试，不看代码。测试通过 = 验收通过。

---

## 0. 三条铁律（先记住，再看下文）

1. **契约一次冻结，全员只引用，不修改。** 数据库 schema、tRPC procedure 类型、测试规约一旦在 Phase 1 锁定，后续任何 subagent 改动都必须走"契约变更工单"重新冻结。
2. **每个 subagent 是无记忆的孤儿。** 它不读 BRD，不读历史对话，不知其他 subagent 存在。它只收到一份 ≤ 8KB 的自包含 prompt + 1～3 个文件路径 + 1 条验证命令。
3. **测试先于实现，红绿驱动。** 任何实现类 subagent 启动前，对应的失败测试必须已存在。它的成功条件就是"让这条测试从红变绿，且不破坏其他绿测试"。

---

## 1. 技术栈与目录结构

### 1.1 选型理由（为什么省 token）

| 选型 | 节省点 |
|------|--------|
| **Next.js App Router** | 前后端同仓，免去 CORS / 双部署 / 双类型同步 |
| **tRPC v11** | 类型从后端自动推到前端，前端调用零样板，无需写 OpenAPI/客户端代码 |
| **Prisma + SQLite** | schema 单文件即定义 DB + TS 类型 + 客户端，迁移命令一行 |
| **Vitest** | 与 Next.js 共享 TS 配置，无需另写 jest.config |
| **Playwright** | 一个工具同时跑 E2E + 截图 + 录像，自带 trace viewer |
| **共享 Zod schema** | 输入校验 + 类型推导 + OpenAPI 文档三合一 |

### 1.2 目录结构（强制约定）

```
project-root/
├── prisma/
│   └── schema.prisma          ← 契约 #1：数据模型
├── src/
│   ├── contracts/             ← 契约 #2：tRPC procedure 类型骨架（无实现）
│   │   ├── user.contract.ts
│   │   ├── inventory.contract.ts
│   │   └── README.md          ← 契约修改流程
│   ├── server/
│   │   ├── db.ts              ← Prisma client 单例
│   │   ├── trpc.ts            ← tRPC 初始化、ctx、middleware
│   │   ├── routers/           ← 实现层（subagent 只动这里）
│   │   │   ├── user.router.ts
│   │   │   ├── role.router.ts
│   │   │   ├── goods.router.ts
│   │   │   ├── inbound.router.ts
│   │   │   └── ...（每个功能一个文件）
│   │   ├── services/          ← 纯业务逻辑（无 IO）
│   │   └── repositories/      ← 数据访问层
│   └── app/
│       ├── (auth)/login/page.tsx
│       ├── (admin)/users/...
│       ├── (admin)/inventory/...
│       └── api/trpc/[trpc]/route.ts
├── tests/
│   ├── unit/                  ← Vitest，测纯函数
│   ├── integration/           ← Vitest，测 tRPC + 真 SQLite
│   ├── e2e/                   ← Playwright spec
│   ├── fixtures/              ← 持久化登录态、种子数据
│   └── README.md              ← 测试约定
├── prompts/                   ← 所有 subagent 的自包含 prompt
│   ├── phase-1-architecture/
│   ├── phase-2-test-red/
│   ├── phase-3-impl-green/
│   └── phase-4-e2e/
├── .test-state/               ← Playwright 持久化 storage
├── playwright.config.ts
├── vitest.config.ts
└── orchestrator.md            ← 编排器主控脚本（人类阅读）
```

### 1.3 单一真相源（SoT）清单

| 文件 | 唯一定义 | 谁能修改 |
|------|----------|----------|
| `prisma/schema.prisma` | 数据模型 | 仅 `schema-architect` |
| `src/contracts/*.contract.ts` | tRPC 输入输出类型 | 仅 `contract-architect` |
| `tests/**/*.test.ts` | 行为契约 | 仅 `test-writer-*` 系列 |
| `src/server/routers/*` | 业务实现 | `service-impl-*` + `bug-fixer` |
| `src/app/**` | UI 实现 | `ui-impl-*` + `bug-fixer` |

任何 subagent 越界修改 = 编排器拒收。

---

## 2. Subagent 角色目录

每个角色都标注：**输入大小、输出文件数、上下文预算**。预算越小越好。

### 2.1 Tier 0 — 引导（1 个）

| 角色 | 职责 | 输入预算 | 输出 |
|------|------|----------|------|
| `bootstrap-agent` | 跑 `create-next-app`、装依赖、写 4 个配置文件、跑 `prisma init` | 2KB | package.json / tsconfig / vitest.config / playwright.config |

### 2.2 Tier 1 — 架构契约（3 个，串行）

| 角色 | 职责 | 输入预算 | 输出 |
|------|------|----------|------|
| `schema-architect` | 把 BRD 第 4.6/5.6 节数据字段译成 Prisma schema | 4KB（仅数据字段段落） | `prisma/schema.prisma` |
| `contract-architect` | 为每个功能定义 tRPC procedure 的 input/output Zod schema（仅类型，无实现） | 6KB（schema.prisma + BRD 功能清单表） | `src/contracts/*.contract.ts` |
| `test-spec-author` | 把 BRD 业务规则译成 Gherkin/JSON 测试规约 | 6KB（BRD 第 4/5 章业务规则段落） | `tests/spec/*.spec.json` |

### 2.3 Tier 2 — 测试编写（红测）

每个功能拆 3 个 subagent，并行触发。**这是 token 最大的环节，但每个 subagent 只看自己那一片。**

| 角色（按功能各一份） | 职责 | 输入 | 输出 |
|----------------------|------|------|------|
| `unit-test-writer-{feature}` | 写纯函数单测（如密码强度校验、库存可用量计算） | 该功能的 spec.json + 相关 contract | `tests/unit/{feature}.test.ts` |
| `integration-test-writer-{router}` | 写 tRPC + SQLite 集成测试 | 该 router 的 contract + spec.json | `tests/integration/{router}.test.ts` |
| `e2e-test-writer-{flow}` | 写 Playwright spec | 该流程的 spec.json + 页面路径表 | `tests/e2e/{flow}.spec.ts` |

**实例化数量**：22 个功能 × 3 = **66 个测试 subagent**（可全部并行）。

### 2.4 Tier 3 — 实现（绿测）

| 角色 | 职责 | 输入预算 | 输出 |
|------|------|----------|------|
| `repo-impl-{entity}` | 写 Prisma 数据访问层（CRUD + 自定义查询） | schema.prisma + 该实体的失败单测 | `src/server/repositories/{entity}.repo.ts` |
| `service-impl-{module}` | 写纯业务逻辑（如密码哈希、库存扣减算法） | contract + 失败单测 + 相关 repo 接口 | `src/server/services/{module}.service.ts` |
| `router-impl-{router}` | 把 contract 接到 service/repo，让集成测试转绿 | contract + 失败集成测试 + service/repo 签名 | `src/server/routers/{router}.router.ts` |
| `ui-page-impl-{page}` | 实现页面 + 表单，让 E2E 转绿 | 页面 spec + 失败 E2E + 该页用到的 tRPC procedure 列表 | `src/app/.../page.tsx` + 对应组件 |

**实例化数量**：22 个功能 × 平均 3 = **约 60～70 个实现 subagent**。

### 2.5 Tier 4 — 验证（少量、可循环）

| 角色 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `test-runner` | 跑 `npm test` / `npm run test:e2e`，输出 JSON 报告 | 命令行 | `reports/test-result.json` |
| `regression-checker` | 全量回归，比对上一轮通过率 | 当前 + 上一轮 JSON | 通过/退化清单 |
| `coverage-reporter` | 跑覆盖率，标红低覆盖文件 | 命令行 | `reports/coverage.json` |

### 2.6 Tier 5 — 修复（按需触发）

| 角色 | 职责 | 输入预算 | 输出 |
|------|------|----------|------|
| `bug-fixer-light` | 单测失败 → 改 1 个文件 | 失败用例输出 + 1 个实现文件 | 改后的实现文件 |
| `bug-fixer-deep` | `light` 3 次失败后升级，可读 2～3 个相关文件 | 失败用例 + 相关文件群 | 修复 patch |
| `flake-detective` | E2E 间歇失败时定位 race / 时序问题 | 该 spec 的 trace zip | 修复 patch + 解释 |

### 2.7 Tier 6 — 元角色（编排）

| 角色 | 职责 |
|------|------|
| `orchestrator`（即主对话 Claude） | 读 `orchestrator.md`，按阶段 DAG 派发 subagent，收结果，决定下一步 |
| `prompt-builder`（可选，主对话内联即可） | 把"功能 + 角色"组合成自包含 prompt 文件落到 `prompts/` |

---

## 3. 工作流阶段 DAG

```
[Phase 0] bootstrap-agent
                │
                ▼
[Phase 1] schema-architect → contract-architect → test-spec-author
                                                            │
            ┌────────────────────────────────────────────────┤
            ▼                       ▼                       ▼
[Phase 2] unit-test-writer × 22  integration-test-writer × 22  e2e-test-writer × 22
            │                       │                       │
            └───── 全部并行，等齐 ──────────────────────────────┘
                                    │
                       test-runner（应全红）
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
[Phase 3] repo-impl × N      service-impl × N         router-impl × N
            │                       │                       │
            └────── 局部并行，按依赖批次推进 ─────────────────────┘
                                    │
                       test-runner（unit + integration 应转绿）
                                    │
                                    ▼
[Phase 4] ui-page-impl × 22 （并行）
                                    │
                       playwright test（持久化 context）
                                    │
                            ┌───────┴───────┐
                            ▼               ▼
                          通过            失败 → bug-fixer-light
                            │                       │
                            ▼               ┌──────┴──────┐
                      coverage-reporter     ▼             ▼
                            │            重试 ≤3      升级 deep
                            ▼
                         交付门
```

### 3.1 阶段间硬门禁

| 门禁 | 通过条件 |
|------|---------|
| Phase 1 → 2 | `npm run typecheck` 通过；契约文件全部 commit |
| Phase 2 → 3 | 所有测试存在且**全部红**（确认是真红，非语法错误） |
| Phase 3 → 4 | unit + integration 100% 绿 |
| Phase 4 → 交付 | E2E 100% 绿 + 覆盖率 ≥ 80% |

---

## 4. 自包含 Prompt 模板库

> 所有模板的共同格式：**[身份] [输入文件清单] [产出文件] [硬约束] [验证命令] [完成定义]**。
> 每个 subagent 看到的就是替换好占位符的最终 prompt，**无需读其他文件以外的任何东西**。

### 4.1 模板 A：`schema-architect`

```markdown
# Role: Prisma Schema Architect

## Goal
Translate the data field tables in the attached BRD excerpt into a single Prisma schema file.

## Inputs (read these files only)
- `inputs/brd-data-fields.md`  ← 仅 BRD 第 4.6 与 5.6 节数据字段表

## Output
- Write to: `prisma/schema.prisma`

## Hard Constraints
- Database provider = sqlite, output = "../node_modules/.prisma/client"
- Every model must include `id`, `createdAt`, `updatedAt`
- Soft-delete via `deletedAt DateTime?`
- Use enums for status fields (UserStatus, DocStatus)
- Decimal fields use `Decimal` with precision 18, scale 4
- Add indexes on all foreign keys and on (warehouseId, locationId, goodsId) for stock
- DO NOT touch any other file

## Verification
Run: `npx prisma format && npx prisma validate`
Expected: zero errors

## Done When
- File written, command above passes
- Output a 5-line summary of model count + enums + key indexes
```

### 4.2 模板 B：`contract-architect`（按 router 切片）

```markdown
# Role: tRPC Contract Architect — {router_name} ({router_codes})

## Goal
Define the Zod input/output schemas and tRPC procedure signatures for the {router_name} router.
NO implementation — bodies must be `// IMPL_HERE` placeholder.

## Inputs
- `prisma/schema.prisma`
- `inputs/brd-feature-{router_codes}.md`  ← 该 router 涉及的功能片段

## Output
- Write to: `src/contracts/{router_name}.contract.ts`

## Hard Constraints
- Export `{routerName}Contract` object: `{ procedureName: { input: ZodSchema, output: ZodSchema, type: 'query'|'mutation' } }`
- Every input must include explicit Zod refinements (e.g., min/max, regex)
- Use shared schemas from `src/contracts/_shared.ts` for Pagination, IdParam, Timestamps
- DO NOT import from `src/server/*`
- DO NOT write resolvers

## Verification
Run: `npx tsc --noEmit`
Expected: zero errors in this file

## Done When
- File written, typecheck passes
- Echo the procedure list as bullet points
```

### 4.3 模板 C：`integration-test-writer-{router}`

```markdown
# Role: Integration Test Writer — {router_name}

## Goal
Write Vitest integration tests for every procedure of {router_name}, hitting a real SQLite test DB.
Tests MUST FAIL initially (no implementation yet) — this is RED phase.

## Inputs
- `src/contracts/{router_name}.contract.ts`
- `tests/spec/{router_name}.spec.json`   ← 该 router 的所有用例（步骤 + 期望）
- `tests/fixtures/db.ts`                 ← 已就绪的测试 DB 工具

## Output
- Write to: `tests/integration/{router_name}.test.ts`

## Hard Constraints
- Use Vitest `describe / it`, Chinese-readable test names (e.g., `it('注册时手机号重复应报 DUPLICATE_MOBILE')`)
- One `describe` per procedure; each spec.json case = one `it`
- Setup: `beforeEach` runs `resetDb() + seed()` from fixtures
- Use the tRPC server-side caller (no HTTP), import from `src/server/_caller.ts` (already exists)
- Cover: happy path + every business rule (BR-* in spec.json) + every error code
- DO NOT write any implementation
- DO NOT mock the database

## Verification
Run: `npx vitest run tests/integration/{router_name}.test.ts`
Expected: every test fails with "procedure not implemented" or similar — count must equal spec.json case count

## Done When
- Test count = spec case count
- All RED, no compile errors
```

### 4.4 模板 D：`router-impl-{router}`（绿测实现）

```markdown
# Role: tRPC Router Implementer — {router_name}

## Goal
Implement {router_name} so all its integration tests turn green, without breaking any other green test.

## Inputs (READ ONLY)
- `src/contracts/{router_name}.contract.ts`             ← 类型契约
- `tests/integration/{router_name}.test.ts`             ← 必须让它绿
- `src/server/repositories/{related_entities}.repo.ts`  ← 已实现的数据访问
- `src/server/services/{related_module}.service.ts`     ← 已实现的业务逻辑
- `src/server/trpc.ts`                                  ← procedure / middleware 定义

## Output (WRITE ONLY)
- `src/server/routers/{router_name}.router.ts`

## Hard Constraints
- Import input/output Zod schemas from contract — DO NOT redefine
- Use `protectedProcedure` for all writes; `publicProcedure` only for login/register
- All errors must throw `TRPCError` with explicit code (BAD_REQUEST / CONFLICT / NOT_FOUND / FORBIDDEN)
- DO NOT modify contract, schema, repo, service, tests
- DO NOT add new files

## Verification
Run: `npx vitest run tests/integration/{router_name}.test.ts`
Expected: 100% pass

Then: `npx vitest run` (full suite)
Expected: no previously-green test turns red

## Done When
- Both verifications pass
- Echo the diff line count (should be < 200 lines for most routers)
```

### 4.5 模板 E：`e2e-test-writer-{flow}`

```markdown
# Role: Playwright E2E Test Writer — {flow_name}

## Goal
Write a Playwright spec covering the {flow_name} user journey end-to-end. Spec must FAIL initially.

## Inputs
- `tests/spec/e2e-{flow_name}.spec.json`   ← 步骤 + 期望
- `tests/fixtures/auth.ts`                  ← 持久化登录 fixture
- `docs/page-map.md`                        ← URL → 页面 selector 映射

## Output
- Write to: `tests/e2e/{flow_name}.spec.ts`

## Hard Constraints
- Use `test.use({ storageState: 'tests/fixtures/state-{role}.json' })` for the role indicated in spec
- Selectors via `page.getByRole / getByLabel / getByTestId` — NEVER css class
- Each `test()` Chinese-readable name (e.g., `test('仓管员能完成一次完整的采购入库')`)
- Use `expect.poll` for async list updates
- Screenshot on failure: built-in playwright config (no extra code)
- DO NOT modify other tests, fixtures, or any src/

## Verification
Run: `npx playwright test tests/e2e/{flow_name}.spec.ts --reporter=line`
Expected: all tests fail (UI not implemented yet)

## Done When
- Test count matches spec case count
- All RED with non-trivial failure (selector not found, not syntax error)
```

### 4.6 模板 F：`bug-fixer-light`

```markdown
# Role: Bug Fixer (light)

## Goal
Make ONE failing test green by editing ONE file. If that's not possible in 1 file, output `ESCALATE` instead.

## Inputs
- Failing test name: {test_name}
- Failing test file: {test_file}    （只读）
- Suspect implementation file: {impl_file}  （可改）
- Failure output: see below

## Failure Output
```
{paste vitest/playwright output here}
```

## Hard Constraints
- Edit ONLY {impl_file}
- DO NOT touch tests, contracts, schema
- DO NOT add new files
- DO NOT add `// @ts-ignore` or skip the test

## Verification
Run: `<verification_command>`
Expected: target test green, no other test regresses

## Done When
- Verification passes, OR
- Output `ESCALATE: <one-line reason>` if root cause is outside {impl_file}
```

---

## 5. Playwright 持久化测试方案

### 5.1 持久化 context 的用法

`playwright-cli open --headed --persistent` 在新版 Playwright 里对应：

```bash
# 交互式打开（人工调试用）
npx playwright open --browser=chromium --user-data-dir=.test-state/chromium http://localhost:3000

# 自动化测试（CI / 验收用）
npx playwright test --headed
```

在 `playwright.config.ts` 里把"持久化"做进 fixture：

```ts
// tests/fixtures/auth.ts
import { test as base, chromium } from '@playwright/test';
import path from 'path';

export const test = base.extend<{ persistentContext: BrowserContext }>({
  persistentContext: async ({}, use, testInfo) => {
    const role = testInfo.tags[0]?.replace('@', '') ?? 'anon';
    const userDataDir = path.resolve(`.test-state/${role}`);
    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: process.env.CI === 'true',
    });
    await use(ctx);
    await ctx.close();
  },
});
```

### 5.2 角色 × 持久化目录矩阵

| storageState 文件 | 用途 |
|-------------------|------|
| `.test-state/anon` | 未登录场景（注册、登录、找回密码） |
| `.test-state/super-admin` | 全权限管理后台 |
| `.test-state/sys-admin` | 用户管理 |
| `.test-state/wh-mgr` | 库存审核类 |
| `.test-state/wh-op` | 库存录入类 |

### 5.3 全功能点击测试矩阵（自动生成）

每个 e2e spec 必须覆盖该流程下所有：
- 链接（`a[href]`）
- 按钮（`button, [role=button]`）
- 输入框（`input, textarea, select`）
- 表单提交

由 `e2e-test-writer-{flow}` 根据 `spec.json` + 页面 selector map 生成具体断言。**不允许"看心情"测**——spec.json 是穷举清单。

### 5.4 测试启动顺序

```bash
# 1. 起 Next.js 开发服务（后台）
npm run dev &

# 2. 等服务起来（playwright config webServer 自动等）

# 3. 跑测试
npm run test:unit          # vitest unit
npm run test:integration   # vitest integration
npm run test:e2e:headed    # playwright headed (本地)
npm run test:e2e           # playwright headless (CI)
```

`playwright.config.ts` 用 `webServer` 字段托管 dev server，subagent 不用关心起停。

---

## 6. 上下文最小化策略

### 6.1 输入切片规则（编排器执行）

| 文件类型 | 切片粒度 |
|----------|---------|
| BRD | 按"功能编号"切片，每片 1～2KB |
| schema.prisma | 整文件传（< 6KB），所有人都引用 |
| contract | 按 router 切片，每片 < 3KB |
| spec.json | 按用例切片 |
| 既有实现 | 仅传"被本次任务依赖的"文件，不全传 |

### 6.2 Prompt 体积上限

| 角色 | 上限 |
|------|------|
| 架构层 | 8KB |
| 测试编写 | 6KB |
| 实现 | 8KB（含相关文件） |
| 修复 | 5KB |

超限即拆分子任务。

### 6.3 输出体积上限（防止 subagent 越界）

| 角色 | 输出上限 |
|------|---------|
| 单文件实现 | 300 行 |
| 单 router 测试文件 | 400 行 |
| 单 e2e spec | 250 行 |

超限的 subagent 必须先输出 `SPLIT_REQUEST`，由编排器再分。

### 6.4 严禁动作清单（写进所有 prompt 模板的 footer）

- ❌ 不读其他文件（即使想确认）
- ❌ 不跨目录修改
- ❌ 不修改 package.json / tsconfig / 配置文件
- ❌ 不写任何 README / 注释超过 1 行
- ❌ 不安装新依赖（如缺，输出 `MISSING_DEP: <name>`）
- ❌ 不跑 `git` 任何命令

---

## 7. 编排器（Orchestrator）逻辑

> 这是主对话 Claude 的"操作手册"。

### 7.1 入口流程

```
1. 读取 BRD + 本工作流文档（一次性）
2. 生成 prompts/ 下所有 subagent 任务文件（prompt-builder 内联完成）
3. 按 Phase DAG 派发：
   - 每 Phase 内并行的任务，用一条消息里多个 Agent 工具调用
   - Phase 间串行
4. 每个 Phase 结束运行硬门禁
5. 任何门禁失败 → 触发对应修复链路（最多 3 轮）
6. 全绿 → 输出交付报告
```

### 7.2 派发并行任务的范式（伪代码）

```
# Phase 2 同时派发 22 × 3 = 66 个 subagent
for feature in features_22:
  spawn_parallel(
    Agent("integration-test-writer", prompt=fill_template_C(feature)),
    Agent("e2e-test-writer", prompt=fill_template_E(feature)),
    Agent("unit-test-writer", prompt=fill_template_unit(feature)),
  )
wait_all()
run("npx vitest run --reporter=json > reports/red.json")
assert all_failing(reports/red.json)
```

实际执行时分批，每批 5～8 个并发，避免文件系统锁竞争。

### 7.3 失败重试机制

| 失败类型 | 重试策略 |
|----------|---------|
| 单测失败 | bug-fixer-light → ≤3 次 → 失败升级 deep |
| 集成测试失败 | bug-fixer-light（router 文件）→ 升级 |
| E2E 失败 | 先看是 selector 错（test-writer 修）还是 UI 错（ui-impl 修）|
| E2E flaky | flake-detective 介入 |
| 编译错误 | 看是契约违反（拒收）还是实现 bug（fix） |
| 覆盖率低 | 派 `coverage-gap-filler` 补测试 |

### 7.4 交付报告模板（人类只看这个）

```
# 交付报告 v{N}

## 测试通过率
- Unit: 187 / 187 (100%)
- Integration: 124 / 124 (100%)
- E2E: 38 / 38 (100%)

## 覆盖率
- Lines: 87.3%
- Branches: 81.4%

## BRD 功能映射验证
| 功能编号 | 集成测试用例数 | E2E 用例数 | 状态 |
| F-UM-01 | 8 | 2 | ✅ |
| F-UM-02 | 6 | 3 | ✅ |
| ... |
| F-IM-11 | 4 | 1 | ✅ |

## 风险/待办
- （列出 spec.json 里标 P1/P2 但本期未实现的项）

## 验收命令（人类亲自跑一次）
$ npm run verify:all
```

---

## 8. BRD ↔ Subagent 实例化映射表

> 编排器据此生成 prompts/ 下所有任务。

### 8.1 用户管理（11 个功能 → 33+ subagent）

| 功能 | router | unit-test | integration-test | e2e-test | repo-impl | service-impl | router-impl | ui-impl |
|------|--------|-----------|------------------|----------|-----------|--------------|-------------|---------|
| F-UM-01 注册 | user.router | password-strength | user.register | flow-register | user.repo | password.svc | user.router | /register |
| F-UM-02 登录 | auth.router | jwt-sign/verify | auth.login | flow-login | session.repo | auth.svc | auth.router | /login |
| F-UM-03 信息维护 | user.router | mobile-validate | user.updateProfile | flow-profile | — | — | user.router | /profile |
| F-UM-04 密码 | auth.router | password-policy | auth.changePwd / reset | flow-pwd | — | password.svc | auth.router | /pwd |
| F-UM-05 角色 | role.router | — | role.crud | flow-role | role.repo | — | role.router | /admin/roles |
| F-UM-06 权限 | permission.router | rbac-merge | permission.assign | flow-perm | perm.repo | rbac.svc | permission.router | /admin/perms |
| F-UM-07 状态 | user.router | status-machine | user.changeStatus | flow-status | — | — | user.router | /admin/users |
| F-UM-08 部门 | dept.router | — | dept.tree | flow-dept | dept.repo | — | dept.router | /admin/depts |
| F-UM-09 查询/批量 | user.router | — | user.search / batch | flow-user-mgmt | — | — | user.router | /admin/users |
| F-UM-10 审计 | audit.router | — | audit.query | flow-audit | audit.repo | audit.svc | audit.router | /admin/audit |
| F-UM-11 安全策略 | auth.router | rate-limit / captcha | auth.failLock | flow-lock | — | rateLimit.svc | auth.router | (融入 /login) |

### 8.2 库存管理（11 个功能 → 33+ subagent）

| 功能 | router | unit-test | integration-test | e2e-test | repo-impl | service-impl | router-impl | ui-impl |
|------|--------|-----------|------------------|----------|-----------|--------------|-------------|---------|
| F-IM-01 商品 | goods.router | sku-code-gen | goods.crud | flow-goods | goods.repo | — | goods.router | /inv/goods |
| F-IM-02 仓库/库位 | warehouse.router | location-cap | warehouse.crud | flow-wh | wh.repo | — | warehouse.router | /inv/warehouses |
| F-IM-03 入库 | inbound.router | — | inbound.create/audit | flow-inbound | inbound.repo + stock.repo | stock-add.svc | inbound.router | /inv/inbound |
| F-IM-04 出库 | outbound.router | available-calc / fifo | outbound.create/audit | flow-outbound | outbound.repo + stock.repo | stock-deduct.svc | outbound.router | /inv/outbound |
| F-IM-05 调拨 | transfer.router | in-transit-calc | transfer.flow | flow-transfer | transfer.repo | transfer.svc | transfer.router | /inv/transfer |
| F-IM-06 盘点 | stocktake.router | diff-calc | stocktake.flow | flow-stocktake | stocktake.repo | stocktake.svc | stocktake.router | /inv/stocktake |
| F-IM-07 预警 | alert.router | threshold-eval | alert.scan | flow-alert | alert.repo | alert.svc | alert.router | /inv/alerts |
| F-IM-08 查询 | stock.router | — | stock.query | flow-stock-query | stock.repo | — | stock.router | /inv/stock |
| F-IM-09 报表 | report.router | report-aggregate | report.run | flow-report | report.repo | report.svc | report.router | /inv/reports |
| F-IM-10 流水 | stockLog.router | — | stockLog.query | flow-stocklog | stockLog.repo | — | stockLog.router | /inv/stock-log |
| F-IM-11 分类/单位 | category.router | unit-convert | category.crud | flow-category | cat.repo | unit.svc | category.router | /inv/categories |

**合计 subagent 任务数（不含 bootstrap / 架构 / 验证 / 修复）：**

- 测试编写：22 × 3 ≈ 66
- 实现：约 22 × 3 ≈ 66（部分 service/repo 复用，实际 50 左右）
- **核心约 ~120 个 subagent 任务，每个 prompt ≤ 8KB ⇒ 总输入约 1MB，但单 subagent 上下文压力极小**

---

## 9. 可立即执行的启动清单

人类（你）只需要做这 4 件事：

1. **确认 BRD**（已完成）
2. **确认本工作流文档**（看完就行）
3. 给主对话 Claude 一句话指令：
   ```
   读 工作流_TDD_Subagent分工.md 和 业务需求文档_用户与库存管理.md，
   按 Phase 0 → 4 派发 subagent，最终输出交付报告。
   ```
4. 等交付报告。看通过率 + 抽样跑 `npm run test:e2e:headed` 用眼睛看一下浏览器演示。

**人类全程不读 src/ 任何代码。** 任何"我觉得这里写得不好"都用追加测试用例的方式表达——继而触发新一轮红绿循环。

---

## 10. 常见反模式（必须避免）

| 反模式 | 为什么不行 | 正确做法 |
|--------|-----------|---------|
| 让一个大 subagent 实现整个 router | 上下文爆炸 | 拆成 procedure 级 subagent |
| 让 subagent 顺手"优化"它看到的别的代码 | 破坏其他绿测、扩散影响面 | Hard constraint 禁止跨文件 |
| Test 和 Impl 同一个 subagent 写 | TDD 形同虚设，自己测自己 | 强制分 writer / impl 两批 |
| 用 mock DB 跑集成测试 | 与 prod 行为偏离 | SQLite 内存模式即可，免 mock |
| 不写 storageState，每个 e2e 都重登录 | 慢、且互相干扰 | 持久化 context + 角色矩阵 |
| 失败后无限重试同一 subagent | 卡死 | light 3 次 → deep → 人工介入 |
| 让 subagent 自行 npm install | 依赖混乱 | 唯一 bootstrap-agent 锁定 |

---

**—— 工作流文档结束 ——**
