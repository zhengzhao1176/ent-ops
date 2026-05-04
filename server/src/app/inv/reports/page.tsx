'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

// 报表 dashboard — 5 个 trpc.report.* 只读查询的可视化页面。
// 注意：BigInt id 一律以 string 形式参与 queryKey，避免 react-query 在 JSON.stringify
// 时抛出 BigInt serialization 错。日期通过 <input type="date"> 收集，提交前转 Date，
// 由 superjson 处理 Date 在 tRPC 链路上的来回。

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function toStartOfDay(s: string): Date {
  // 把 yyyy-MM-dd 当作本地 0 点解析；contract 用 z.date()，superjson 序列化即可
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function toEndOfDay(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
}

type Direction = 'INBOUND' | 'OUTBOUND' | 'BOTH';

export default function ReportsPage() {
  // ----- 控件 state -----
  const [from, setFrom] = useState<string>(daysAgoStr(30));
  const [to, setTo] = useState<string>(todayStr());
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [direction, setDirection] = useState<Direction>('BOTH');
  const [slowDays, setSlowDays] = useState<number>(90);

  // 触发 refresh 用：每次点击递增 nonce 让 queryKey 变化，配合 useQuery 的 enabled
  const [nonce, setNonce] = useState(0);

  // 仓库下拉
  const warehouses = trpc.warehouse.list.useQuery({ page: 1, pageSize: 200 });

  // ----- 计算 query input；BigInt id 全部保持 string 进 queryKey -----
  const fromDate = useMemo(() => toStartOfDay(from), [from]);
  const toDate = useMemo(() => toEndOfDay(to), [to]);
  const wh = warehouseId || undefined;

  // summary：from/to 都是可选；warehouseId 可选
  const summary = trpc.report.summary.useQuery({
    from: fromDate,
    to: toDate,
    warehouseId: wh,
  });

  // dailyMovement：from/to 必填
  const daily = trpc.report.dailyMovement.useQuery({
    from: fromDate,
    to: toDate,
    warehouseId: wh,
  });

  // topGoodsByMovement：from/to/direction 必填，limit 默认 10
  const top = trpc.report.topGoodsByMovement.useQuery({
    from: fromDate,
    to: toDate,
    direction,
    limit: 10,
  });

  // slowMovingGoods：days 必填（带默认 90），limit 默认 50，warehouseId 可选
  const slow = trpc.report.slowMovingGoods.useQuery({
    days: slowDays,
    warehouseId: wh,
    limit: 50,
  });

  // stockByWarehouse：input 是 z.object({}).optional()
  const stockByWh = trpc.report.stockByWarehouse.useQuery();

  // 触发全部 refetch
  function refreshAll() {
    setNonce((n) => n + 1);
    summary.refetch();
    daily.refetch();
    top.refetch();
    slow.refetch();
    stockByWh.refetch();
  }
  void nonce; // referenced for future cache-busting if needed

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">报表分析</h1>
      </div>

      {/* 过滤栏 */}
      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="label">起始日期</label>
          <input
            data-testid="input-from"
            type="date"
            className="input max-w-[12rem]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label">结束日期</label>
          <input
            data-testid="input-to"
            type="date"
            className="input max-w-[12rem]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="label">仓库</label>
          <select
            data-testid="select-warehouseId"
            className="input max-w-[14rem]"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">全部仓库</option>
            {(warehouses.data?.items ?? []).map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <button
          data-testid="btn-refresh"
          className="btn btn-primary"
          onClick={refreshAll}
        >
          刷新
        </button>
      </div>

      {/* KPI 卡片行 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">汇总指标</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            testId="card-goodsCount"
            title="商品总数"
            value={summary.data ? String(summary.data.goodsCount) : '-'}
          />
          <Kpi
            testId="card-activeWarehouseCount"
            title="活跃仓库数"
            value={
              summary.data ? String(summary.data.activeWarehouseCount) : '-'
            }
          />
          <Kpi
            testId="card-totalStockOnHand"
            title="总现存量"
            value={summary.data?.totalStockOnHand ?? '-'}
          />
          <Kpi
            testId="card-lowStockCount"
            title="低库存预警"
            value={
              summary.data ? String(summary.data.lowStockCount) : '-'
            }
          />
          <Kpi
            testId="card-inboundCount"
            title="入库单数"
            value={summary.data ? String(summary.data.inboundCount) : '-'}
          />
          <Kpi
            testId="card-outboundCount"
            title="出库单数"
            value={summary.data ? String(summary.data.outboundCount) : '-'}
          />
          <Kpi
            testId="card-transferCount"
            title="调拨单数"
            value={summary.data ? String(summary.data.transferCount) : '-'}
          />
          <Kpi
            testId="card-stocktakeCount"
            title="盘点单数"
            value={summary.data ? String(summary.data.stocktakeCount) : '-'}
          />
        </div>
        {summary.isError && (
          <div className="mt-2 text-xs text-red-600">
            汇总加载失败：{summary.error?.message}
          </div>
        )}
      </section>

      {/* 每日出入库 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">每日出入库</h2>
        <div className="bg-white rounded shadow border border-gray-100">
          <table data-testid="table-daily-movement" className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">日期</th>
                <th className="px-4 py-2">入库数量</th>
                <th className="px-4 py-2">出库数量</th>
              </tr>
            </thead>
            <tbody>
              {(daily.data ?? []).map((row) => (
                <tr
                  key={row.date}
                  data-testid={`row-day-${row.date}`}
                  className="border-t border-gray-100"
                >
                  <td className="px-4 py-2 font-mono">{row.date}</td>
                  <td className="px-4 py-2" data-testid="cell-inboundQty">
                    {row.inboundQty}
                  </td>
                  <td className="px-4 py-2" data-testid="cell-outboundQty">
                    {row.outboundQty}
                  </td>
                </tr>
              ))}
              {(daily.data ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {daily.isLoading ? '加载中…' : '区间内无出入库记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {daily.isError && (
          <div className="mt-2 text-xs text-red-600">
            每日数据加载失败：{daily.error?.message}
          </div>
        )}
      </section>

      {/* Top 商品 */}
      <section className="mb-6">
        <div className="flex items-end gap-3 mb-2">
          <h2 className="text-sm font-semibold text-gray-700">出入库 TOP 商品</h2>
          <select
            data-testid="select-direction"
            className="input max-w-[10rem] !py-1"
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
          >
            <option value="BOTH">出 + 入</option>
            <option value="INBOUND">仅入库</option>
            <option value="OUTBOUND">仅出库</option>
          </select>
        </div>
        <div className="bg-white rounded shadow border border-gray-100">
          <table data-testid="table-top-goods" className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">商品编码</th>
                <th className="px-4 py-2">商品名称</th>
                <th className="px-4 py-2">入库合计</th>
                <th className="px-4 py-2">出库合计</th>
                <th className="px-4 py-2">净变化</th>
              </tr>
            </thead>
            <tbody>
              {(top.data ?? []).map((row) => (
                <tr
                  key={String(row.goodsId)}
                  data-testid={`row-top-goods-${String(row.goodsId)}`}
                  className="border-t border-gray-100"
                >
                  <td className="px-4 py-2 font-mono">{row.goodsCode}</td>
                  <td className="px-4 py-2">{row.goodsName}</td>
                  <td className="px-4 py-2">{row.totalIn}</td>
                  <td className="px-4 py-2">{row.totalOut}</td>
                  <td className="px-4 py-2">{row.netChange}</td>
                </tr>
              ))}
              {(top.data ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {top.isLoading ? '加载中…' : '区间内无数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {top.isError && (
          <div className="mt-2 text-xs text-red-600">
            TOP 商品加载失败：{top.error?.message}
          </div>
        )}
      </section>

      {/* 滞销商品 */}
      <section className="mb-6">
        <div className="flex items-end gap-3 mb-2">
          <h2 className="text-sm font-semibold text-gray-700">滞销商品</h2>
          <div>
            <label className="label">滞销天数阈值</label>
            <input
              data-testid="input-slow-days"
              type="number"
              min={1}
              max={3650}
              className="input max-w-[8rem]"
              value={slowDays}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setSlowDays(v);
              }}
            />
          </div>
        </div>
        <div className="bg-white rounded shadow border border-gray-100">
          <table data-testid="table-slow-moving" className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">商品编码</th>
                <th className="px-4 py-2">商品名称</th>
                <th className="px-4 py-2">现存量</th>
                <th className="px-4 py-2">最近出库时间</th>
                <th className="px-4 py-2">未出库天数</th>
              </tr>
            </thead>
            <tbody>
              {(slow.data ?? []).map((row) => (
                <tr
                  key={String(row.goodsId)}
                  data-testid={`row-slow-${String(row.goodsId)}`}
                  className="border-t border-gray-100"
                >
                  <td className="px-4 py-2 font-mono">{row.goodsCode}</td>
                  <td className="px-4 py-2">{row.goodsName}</td>
                  <td className="px-4 py-2">{row.qtyOnHand}</td>
                  <td className="px-4 py-2">
                    {row.lastOutboundAt
                      ? new Date(row.lastOutboundAt).toLocaleDateString()
                      : '从未出库'}
                  </td>
                  <td className="px-4 py-2">
                    {row.daysSinceLastOutbound ?? '-'}
                  </td>
                </tr>
              ))}
              {(slow.data ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {slow.isLoading ? '加载中…' : '没有命中阈值的滞销商品'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {slow.isError && (
          <div className="mt-2 text-xs text-red-600">
            滞销商品加载失败：{slow.error?.message}
          </div>
        )}
      </section>

      {/* 各仓库库存 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">各仓库库存</h2>
        <div className="bg-white rounded shadow border border-gray-100">
          <table
            data-testid="table-stock-by-warehouse"
            className="w-full text-sm"
          >
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2">仓库编码</th>
                <th className="px-4 py-2">仓库名称</th>
                <th className="px-4 py-2">SKU 数</th>
                <th className="px-4 py-2">总数量</th>
                <th className="px-4 py-2">锁定量</th>
              </tr>
            </thead>
            <tbody>
              {(stockByWh.data ?? []).map((row) => (
                <tr
                  key={String(row.warehouseId)}
                  data-testid={`row-warehouse-${String(row.warehouseId)}`}
                  className="border-t border-gray-100"
                >
                  <td className="px-4 py-2 font-mono">{row.warehouseCode}</td>
                  <td className="px-4 py-2">{row.warehouseName}</td>
                  <td className="px-4 py-2">{row.skuCount}</td>
                  <td className="px-4 py-2">{row.totalQty}</td>
                  <td className="px-4 py-2">{row.totalLocked}</td>
                </tr>
              ))}
              {(stockByWh.data ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {stockByWh.isLoading ? '加载中…' : '暂无仓库'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {stockByWh.isError && (
          <div className="mt-2 text-xs text-red-600">
            仓库库存加载失败：{stockByWh.error?.message}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Kpi({
  testId,
  title,
  value,
}: {
  testId: string;
  title: string;
  value: string;
}) {
  return (
    <div
      data-testid={testId}
      className="bg-white p-4 rounded shadow border border-gray-100"
    >
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
