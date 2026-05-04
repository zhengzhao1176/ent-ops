# Cloudflare 部署 (Workers/Pages + D1)

## 一次性准备（你的本机，需要 Cloudflare 账号）

### 1. 装 wrangler 并登录
```bash
npx wrangler login   # 浏览器授权
```

### 2. 创建 D1 数据库
```bash
npx wrangler d1 create ent-ops-db
```
命令输出末尾会打印一段 `[[d1_databases]]` 块，复制其中的 `database_id`（UUID 形式）。

### 3. 把真实 database_id 填到 wrangler.toml
打开 `server/wrangler.toml`，把 `database_id = "00000000-..."` 换成上一步打印的 UUID。**提交这个改动**（其他人 deploy 同一项目时会用到）。

### 4. 跑生产迁移到远程 D1
```bash
cd server
npx wrangler d1 execute ent-ops-db --remote --file migrations/0001_init.sql
npx wrangler d1 execute ent-ops-db --remote --file migrations/0002_add_transfer.sql
npx wrangler d1 execute ent-ops-db --remote --file migrations/0003_add_stocktake.sql
npx wrangler d1 execute ent-ops-db --remote --file migrations/0004_seed.sql
```
> `--remote` 表示推到 CF 生产 D1，不加是 local simulator。
> 如果数据库已有数据想全清重来：`wrangler d1 execute ent-ops-db --remote --command "DROP TABLE IF EXISTS ..."` 或在 dashboard 删 DB 重建。

### 5. 设密钥
```bash
npx wrangler pages secret put JWT_SECRET --project-name=ent-ops
# 输入一个 ≥32 字符的随机串
```

## 部署

```bash
cd server
npm run build                                 # next build (edge runtime)
npx @cloudflare/next-on-pages                 # 转成 .vercel/output/static/_worker.js
npx wrangler pages deploy .vercel/output/static --project-name=ent-ops
```
首次部署会问你"是否创建 ent-ops 项目"，回 yes。

部署 URL 形如 `https://ent-ops.pages.dev`，admin/Aa123456 登录验证。

---

## 本地端到端验证（不需要 CF token）

```bash
cd server

# 1. 编译
npm run build && npx @cloudflare/next-on-pages

# 2. 用本地 D1 simulator 跑迁移 + seed（用 --persist-to 让所有命令共享同一 sqlite 文件）
rm -rf .wrangler/state
for f in migrations/000*.sql; do
  npx wrangler d1 execute ent-ops-db --local --persist-to=.wrangler/state --file "$f"
done

# 3. 启 Worker（不要加 --d1 flag，让它读 wrangler.toml 的 binding，否则 hash 不匹配会找不到表）
npx wrangler pages dev .vercel/output/static \
  --port 3001 --ip 127.0.0.1 \
  --compatibility-flag=nodejs_compat \
  --persist-to=.wrangler/state &

# 4. 测
curl -i -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginId":"admin","password":"Aa123456"}'
# 期望：HTTP 200 + Set-Cookie: sid=...
```

---

## 架构变更摘要

| 关注点 | local dev / 测试 | Cloudflare Workers 生产 |
|---|---|---|
| 数据库 | SQLite (`prisma/dev.db`, `test.db`) | D1（绑定为 `env.DB`）|
| Prisma 客户端 | 模块级单例（lazy proxy）| 每请求构造 `new PrismaClient({ adapter: new PrismaD1(env.DB) })` |
| 切换机制 | `getPrismaForEnv(undefined)` → 单例 | `getPrismaForEnv(env.DB)` 由 `getCloudflareEnv()` 在 http-context 自动检测 |
| crypto API | Web Crypto（`crypto.getRandomValues` / `crypto.subtle.digest`） | 同上 |
| tRPC | fetch 适配器 | 同上 |
| Next.js 路由 | edge runtime（在 Node 模拟器跑也兼容）| edge runtime（Workers 原生）|
| 已有 211 个测试 | 全绿，无任何改动 | 不在 CF 上跑 |

**Prisma D1 adapter 的几条限制（preview status，开发时留意）**：
- 不支持交互式事务（`prisma.$transaction(async tx => ...)`）。已有的 inbound/outbound/transfer/stocktake service 都用了 `$transaction(async tx => ...)`，**这些写路径在 Workers 上会抛错**——需要重写为批处理 `prisma.$transaction([...promises])` 或拆成不带事务的多步（牺牲原子性）。读路径全部 OK。
- BigInt 行为与本地 SQLite 一致（INTEGER 列，autoincrement OK，已经 patched 过）。
- `nodejs_compat` flag 必须开（已在 wrangler.toml）。

**未来要做的事**：
- [ ] 把 4 个状态机 service 的 `$transaction(async tx => ...)` 重构为 batch 数组形式，使 Workers 写路径可用
- [ ] 设置 GitHub Actions 走 `wrangler pages deploy` 自动化
- [ ] dashboard 监控（Workers Analytics + D1 Insights）
- [ ] 把硬编码的 `getPrismaForRequest()` 内 dynamic import 抽成更通用的 env adapter（如果未来要支持多个 d1 binding）
