# 12 · ui-impl

> **阶段**：Phase 2a — 前端实现（**先于**前端测试）
> **触发时机**：router-impl 完成且后端集成测试 GREEN 之后
> **上游**：`server/src/contracts/**`、`server/domain/{domain,operations}.json`
> **下游**：`13-e2e-test-writer`

## 角色

前端页面与组件实现者。基于 tRPC client + 通用 UI 组件库，按"列表页 / 新建页 / 详情编辑页 / 共用 Form / 共用 Columns"五件套展开每个实体。

> **顺序约定**：用户明确"前端先写代码、再写测试"，因此 e2e 测试由 `13-e2e-test-writer` 在本任务完成之后写。本任务不需要先看测试。

## 目标

为 operations.json 中每个有 P-CRUD-* Pattern 的实体产出可点开、可填写、可提交、可看到结果的最小可用界面，覆盖 P-AUTH 的 4 个公共页 + 主要业务模块的 CRUD 页。

## 输入

- `server/src/contracts/**`（tRPC 类型，自动推导 input/output）
- `server/domain/domain.json`（字段定义、searchFields、filterFields → 列表筛选条 / 表单字段）
- `server/domain/operations.json`（决定要不要画"批量导入"按钮、"审核"按钮、"作废"按钮等）
- `业务需求文档.md` §3.2 角色定义（决定菜单可见性）

## 输出（路径在 `server/src/app/` 与 `server/src/components/` 下）

- 公共页：
  - `app/login/page.tsx`、`app/register/page.tsx`
  - `app/forgot-password/page.tsx`、`app/reset-password/page.tsx`
  - `app/change-password/page.tsx`（首次登录强制改密）
  - `app/(dashboard)/page.tsx` 仪表板（KPI 卡 + 待办池）
- 用户管理：
  - `app/admin/users/page.tsx`（列表 + 搜索 + 筛选 + 分页 + 批量按钮）
  - `app/admin/users/new/page.tsx`、`app/admin/users/[id]/page.tsx`
  - `app/admin/roles/page.tsx`、`app/admin/roles/[id]/page.tsx`
  - `app/admin/permissions/page.tsx`（树形）
  - `app/admin/depts/page.tsx`（树形）
  - `app/admin/audit/page.tsx`（只读，时间线 + 详情）
- 库存管理：
  - `app/inv/goods/page.tsx`、`new`、`[id]`
  - `app/inv/categories/page.tsx`（树形）
  - `app/inv/warehouses/page.tsx`、`app/inv/locations/page.tsx`
  - `app/inv/stock/page.tsx`（只读 + 多维度查询）
  - `app/inv/inbound/page.tsx`、`new`、`[id]`（含状态徽章 + 审核/作废按钮）
  - `app/inv/outbound/...`、`app/inv/transfer/...`、`app/inv/stocktake/...`
  - `app/inv/alerts/page.tsx`
  - `app/inv/reports/...`（库存日报、出入库明细、周转率、滞销、临期、盘点差异）
- 共用：
  - `components/{entity}/Form.tsx` 与 `components/{entity}/Columns.tsx`
  - `components/ui/*`（Button / Input / Select / Table / Pagination / StatusBadge / Toast / Dialog / Tree）
  - `components/layout/{Sidebar,Topbar,Breadcrumbs}.tsx`
  - `lib/trpc.ts`（client 包装）

## 工作流程

1. 搭建基础：tRPC client（`@trpc/client` + `@trpc/react-query` 或 `@trpc/next`）、Zustand/Jotai 全局态、tailwind/css。
2. 公共布局 + 路由守卫：未登录跳 `/login`；首次登录 `password_updated_at == null` 强制跳 `/change-password`。
3. 列表页：默认表格 + 分页 + 搜索框 + 筛选面板 + 列设置；批量按钮根据 `operations.json` 是否启用 P-BATCH 决定。
4. 表单页：从契约 Zod 推导字段；必填红星；唯一字段失焦异步校验；提交按钮 loading；成功 toast 后回列表。
5. 详情页：分块展示主表 + 从表（如入库单含明细）；状态徽章 + transition 按钮（按 operations.json 状态机 options 渲染）。
6. 权限粒度：每个按钮包一个 `<Can perm="xxx">`，`Can` 调本地缓存的 `effectivePermissions`，未授予则 disabled + tooltip 显示原因。
7. **每个交互元素必须挂 `data-testid`**，命名与 `flows.json` 一致：`btn-new-user`、`input-username`、`select-role`、`table-users`、`row-user-{id}`、`badge-status` 等。
8. UX 必备：
   - 空态、加载骨架、错误 toast（区分网络错 / 业务错 / 权限错）
   - 危险操作（删除、作废、重置密码）二次确认弹窗
   - 长列表虚拟滚动；图片懒加载
   - 国际化预留：文案集中到 `i18n/zh-CN.json`

## 硬性约束

- **不**手写 fetch 调 tRPC，统一用类型推导出的 client（`trpc.user.list.useQuery({...})`）
- **不**在组件里写业务规则（如"超管不可禁用"）；服务端会拦，组件按 server 返回的错误展示
- 表单校验来源：契约 Zod 二次复用（`@hookform/resolvers/zod`），不重写校验逻辑
- 文案中文；金额/日期格式遵循统一工具 `lib/format.ts`
- 不引入 antd / chakra 等大型库；优先 shadcn/ui + tailwind 的轻方案
- 保留 `data-testid`，e2e subagent 会强引用

## 验证

```bash
cd server && npx tsc --noEmit
cd server && npm run build              # Next 构建通过
cd server && npm run dev                # 手测核心路径可点通
```

> 注意：本阶段**不跑** e2e 测试，e2e 由后续 subagent 写。本阶段只做"自检三件事"：tsc 干净、build 通过、人工浏览主流程不挂。

## 完成标志

- 所有页面与组件齐全，`tsc --noEmit` 与 `next build` 通过
- 手动浏览以下流程不报错：登录 → 用户列表 → 新建 → 编辑 → 删除 → 恢复；商品 CRUD；入库下单 → 审核；库存查询
- 按钮 / 输入 / 表 都挂了 `data-testid`，命名与 `server/domain/flows.json` 一致

## 失败升级

- 发现契约缺字段 → 通知 contract-writer 加，本任务等
- 发现某 procedure 行为与契约描述不符 → 通知 router-impl 返工
- 发现 BRD 描述模糊（如某种角色看不看得到某菜单）→ 写到本任务的"待澄清清单"并求 PM 确认，本任务先按最小权限默认实现
