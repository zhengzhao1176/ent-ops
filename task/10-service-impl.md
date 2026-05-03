# 10 · service-impl

> **阶段**：Phase 1c — 后端实现（在测试 RED 之后）
> **触发时机**：repo-impl 完成后；router-impl 之前（router 依赖 service 暴露的业务方法）
> **上游**：`server/domain/spec.json`、`server/src/server/repositories/**`
> **下游**：`11-router-impl`

## 角色

业务规则与编排层。把跨 repo 的业务规则（库存校验、状态机 guard、密码策略、审批路由、限频、锁帐户、审计落地）实现为可单测的纯函数 + 编排服务。

## 目标

把 spec.json 的 integration / unit extraCases 中"业务规则类"的诉求落到 service，使后续 router-impl 只剩薄薄的"输入校验+调 service+返回"。

## 输入

- `server/domain/spec.json`
- `server/src/contracts/**`（输入/输出形状）
- `server/src/server/repositories/**`（数据访问）
- `server/tests/unit/**`（推断纯函数签名）
- `server/tests/integration/**`（推断 service 边界）

## 输出

- `server/src/server/services/{name}.service.ts`，按业务域拆分：
  - `password.service.ts`：哈希、强度校验、近 3 次比对、过期判断
  - `session.service.ts`：JWT 签发 / 刷新 / 撤销 / 单点选项
  - `rateLimit.service.ts`：滑动窗口 + 锁帐户
  - `auth.service.ts`：register / login / logout / changePwd / resetPwd
  - `rbac.service.ts`：角色绑定、权限计算、`check(userId, perm)`
  - `audit.service.ts`：写操作 hook（变更前后值 diff）
  - `stock.service.ts`：可用量计算、加减库存（带事务+流水落地）、防负、批次选择（FIFO/FEFO）
  - `stock.math.ts`：纯函数（被 unit 测覆盖）— 可用 = 在库 - 锁定 - 在途出库；批次排序
  - `stocktake.service.ts`：冻结/解冻、差异计算、生成盘盈/盘亏单
  - `inbound.service.ts` / `outbound.service.ts` / `transfer.service.ts`：状态机 + 库存联动
  - `stateMachine.service.ts`：通用 transition 校验（读 operations.json options）
  - `notification.service.ts`：站内消息 / 邮件 / 短信渠道分发（一期可桩）
  - `cron.service.ts`：02:00 跑批入口

## 工作流程

1. 优先实现"被 unit 测引用的纯函数"，让 unit 测先 GREEN。
2. 其次实现"被 integration 测引用的编排方法"，每个方法事务边界清晰：
   - 入库审核 = `prisma.$transaction(tx => { 改单状态 + addQty + appendLog + auditLog })`
   - 出库审核 = `tx => { 校验可用 + 减 stock + 释放锁定 + appendLog + auditLog }`
   - 调拨出库 = `tx => { 减调出仓 stock + 入"在途"虚拟账 + appendLog }`
   - 调拨入库 = `tx => { 出"在途" + 加调入仓 stock + 差异处理 + appendLog }`
3. 业务错误统一抛 TRPCError：库存不足 `PRECONDITION_FAILED`、状态非法 `BAD_REQUEST`、唯一冲突 `CONFLICT`、未授权 `FORBIDDEN`。
4. 审计：每个写方法返回前调用 `audit.log({ entity, action, before, after, ctx })`；before/after 仅 diff 字段。
5. **超管不可禁用 / 至少保留 1 名超管**：在 user.service 的 deactivate / changeRole 入口集中校验。
6. **库存任何变更必须通过 stock.service**：直接动 stock repo 的写方法属违规（在 review 时拦）。

## 硬性约束

- service 层**不感知 HTTP / tRPC**，只接收 typed input + ctx
- 涉及多步写的方法必须包事务（`prisma.$transaction`）
- 时间相关一律走注入的 `clock` 接口（便于 unit 测控时）
- service 之间允许互相调用，但需明确依赖方向，禁止环（如 stock <-> inbound 必须由 inbound 调 stock，不可反向）
- 通过 spec.json 描述的所有规则在 service 中"有且只有一处实现"

## 验证

```bash
cd server && npx tsc --noEmit
cd server && RUN_ID=svc-unit npx vitest run tests/unit
```

期望：单元测试 GREEN（router 还没实现，集成测试仍 RED）。

## 完成标志

- service 文件齐全
- 所有 `tests/unit/**` 用例 GREEN
- 集成测试只剩"router 未导出 procedure / 路由未挂载"类失败
