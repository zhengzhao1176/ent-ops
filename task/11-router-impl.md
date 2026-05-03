# 11 · router-impl

> **阶段**：Phase 1c — 后端实现（在测试 RED 之后）
> **触发时机**：repo-impl + service-impl 完成后
> **上游**：`server/src/contracts/**`、`server/src/server/{repositories,services}/**`、`server/tests/integration/**`
> **下游**：`12-ui-impl`（前端开始消费 tRPC）、`14-test-runner`

## 角色

tRPC router 实现者。把契约 + service 拼起来，让所有集成测试 GREEN。

## 目标

每个实体一个 router 文件，挂到根 `appRouter`，使所有 `server/tests/integration/**` 用例从 RED 变 GREEN，且 `npx tsc --noEmit` 干净。

## 输入（READ-ONLY，禁改）

- `server/src/contracts/{module}/{entityCamel}.contract.ts`
- `server/src/server/repositories/{entityCamel}.repo.ts`
- `server/src/server/services/*.service.ts`
- `server/tests/integration/{entityCamel}.test.ts`
- 工作流文档 §3.4 Impl Skeleton

## 输出

- `server/src/server/routers/{entityCamel}.router.ts`（每个实体一个）
- `server/src/server/routers/_app.router.ts`：根 appRouter，把所有 entity router 拼装
- `server/src/server/trpc.ts`（首次创建）：`initTRPC.context<Context>().create()`、`router`、`publicProcedure`、`protectedProcedure`、`authMiddleware`

## 工作流程

1. 若 trpc 基础设施未建：
   - `Context` 含 `{ user?, prisma, repos, services }`，由 HTTP adapter 在请求时构造
   - `protectedProcedure` 用 middleware 校验 `ctx.user?.id`，缺失抛 `UNAUTHORIZED`
   - `permissionProcedure(perm)` 高阶 middleware：调 `services.rbac.check`
2. 每个实体 router：
   - 直接套契约：`procedure.input(contract.list.input).query(...)`
   - body 只做：①调 service 或 repo；②错误转 `TRPCError`；③对返回做 output 形状裁剪（去 private 字段）
3. extras procedure 一一对应 service 方法：
   - `lockAccount` → `services.user.lock(input, ctx)`
   - `audit`（入库审核）→ `services.inbound.audit(input, ctx)`
   - `void` → `services.inbound.void(input, ctx)`
   - `transition` → `services.stateMachine.transition(input, ctx)`
4. 拼装 `_app.router.ts`：
   ```ts
   export const appRouter = router({
     user: userRouter, role: roleRouter, dept: deptRouter,
     goods: goodsRouter, warehouse: warehouseRouter, location: locationRouter,
     stock: stockRouter, inbound: inboundRouter, outbound: outboundRouter,
     transfer: transferRouter, stocktake: stocktakeRouter,
     audit: auditRouter, alert: alertRouter,
   });
   export type AppRouter = typeof appRouter;
   ```
5. 暴露 HTTP handler：`server/src/server/http.ts`（fetch 适配器或 `next-connect`），供前端 / e2e 测使用。

## 硬性约束

- **禁止**修改契约 / 测试 / schema / repo / service（违反 → 任务退回）
- **禁止** `@ts-ignore` / `.skip` / `.only`
- 所有 procedure 必须显式声明 `protectedProcedure` 或（极少数）`publicProcedure`（仅 login / register / forgotPwd / health）
- 错误一律 `throw new TRPCError({ code, message })`，code 与契约文档约定一致
- output schema 与契约一致；多余字段在 router 层 `pick`/`omit` 掉

## 验证

```bash
cd server && npx tsc --noEmit
cd server && RUN_ID=g1 npx vitest run tests/integration --reporter=json \
  > reports/runs/$(date +%s)/vitest-integration.json
cd server && RUN_ID=g2 npx vitest run                # 全量回归
```

期望：
- tsc 干净
- integration 全部 GREEN
- 全量无回归

## 完成标志

- 所有 router 已挂到 appRouter
- 所有 integration 用例 GREEN
- 无 ts 错
- 输出本次 diff 行数（用于巡检）

## 失败升级

- 发现契约不足以满足业务规则 → 不动契约，改 spec.json + 通知 contract-writer 返工
- 发现 repo / service 缺方法 → 通知对应 subagent 增补，本任务等待
