# 企业基础运营管理系统

一个 Next.js + tRPC + Prisma + Cloudflare Workers/D1 的企业管理系统，覆盖**用户管理**与**库存管理**两大模块（账号 / 角色 / 权限 / 部门 / 审计 / 商品 / 仓库 / 库存 / 入库 / 出库 / 调拨 / 盘点 / 报表）。本仓库主要价值在于**整套 AI 协作开发流程**的可复现实证。

🚀 **生产环境**：https://ent-ops.pages.dev （admin / Aa123456）

---

## 仓库结构

```
.
├── 业务需求文档.md              # BRD（用户管理 + 库存管理 V1.0）
├── 通用工作流_CRUD模式驱动框架.md  # 用 Pattern + Subagent 跑 TDD pipeline 的方法论
├── task/                          # 18 份 subagent 任务文档（contract-writer / repo-impl / ...）
└── server/                        # 实际项目
    ├── src/                       # Next.js App Router + tRPC + 服务/仓储层
    ├── prisma/                    # Prisma schema + migrations
    ├── migrations/                # Cloudflare D1 迁移（与 prisma migrations 同源）
    ├── tests/                     # 单元 / 集成 / E2E
    ├── domain/                    # domain.json / operations.json / flows.json / spec.json
    ├── DEPLOY.md                  # Cloudflare 部署详解
    ├── wrangler.toml              # CF Workers 配置（含 D1 binding）
    └── package.json
```

---

## 测试矩阵

| 层 | 数量 | 覆盖 |
|---|---|---|
| 单元 | 52 | password / mobile / rate-limit / lock-policy / stock-math / state-machine / doc-no / password-hash / stocktake-math |
| 集成 | 158 | 用户 / 角色 / 部门 / 审计 / 商品 / 入库 / 出库 / 调拨 / 盘点 |
| E2E (Playwright) | 21+ | login / users / inbound / outbound / transfer / stocktake / reports + site-walker + lifecycle |

跑一下：
```bash
cd server
npm install
npx prisma migrate deploy
npm run prisma:seed
npm run test:unit && npm run test:integration
```

---

## 本地开发

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate deploy
npm run prisma:seed                       # 建 admin/Aa123456 + 8 内置角色
npm run dev                                # http://localhost:3000
```

## 部署到 Cloudflare

完整流程见 [`server/DEPLOY.md`](server/DEPLOY.md)。简版：

```bash
cd server
npx wrangler login
npx wrangler d1 create ent-ops-db          # 复制 database_id 到 wrangler.toml
for f in migrations/000*.sql; do
  npx wrangler d1 execute ent-ops-db --remote --file "$f"
done
npx wrangler pages secret put JWT_SECRET --project-name=ent-ops
npm run build && npx @cloudflare/next-on-pages
npx wrangler pages deploy .vercel/output/static --project-name=ent-ops
```

---

## 技术栈

- **Next.js 14**（App Router）+ React 18
- **tRPC 11**（fetch 适配器，跨 Node/Edge 通用）
- **Prisma 5.22** + `@prisma/adapter-d1`（双模：本地 SQLite / 生产 D1）
- **Tailwind CSS 3**
- **Vitest** 单元 + 集成测试
- **Playwright** E2E 测试 + `playwright-cli` 交互式浏览器自动化
- **Cloudflare Pages** + **D1**（SQLite-on-edge）+ **Workers**

---

## 设计要点

- **Lazy Prisma Proxy**：`src/lib/db.ts` 让 `import { prisma }` 在 Edge 模块加载时不立即构造客户端，避免 PrismaClient 在 Workers 运行时的初始化报错。
- **`runInTransaction(prisma, fn)` helper**（`src/lib/tx.ts`）：本地走 `$transaction(callback)` 保留原子性，D1 检测到就退化为顺序执行。
- **跨运行时 crypto**（`src/lib/crypto.ts`）：用 Web Crypto API 替代 `node:crypto`，同时跑 Node 18+ / Workers / Edge。
- **状态机集中化**（`src/server/services/stateMachine.service.ts`）：Inbound / Outbound / Transfer / Stocktake 四套状态机声明式集中维护。
- **审计自动落地**：每个写操作 service 末尾调 `auditService.log(ctx, ...)`，AuditLog 表有完整 before/after JSON。

---

## 已知限制

- **Cloudflare D1 不支持交互式事务**（`$transaction(async tx => ...)`）。`runInTransaction` 在 D1 路径上退化为顺序执行，**牺牲原子性**。当前 demo / 小团队场景可接受；高流量生产应改为 batch tx 或 saga。
- D1 是 preview 阶段产品，BigInt 行为与本地 SQLite 一致但官方不保证长期 API 兼容。

---

## License

MIT
