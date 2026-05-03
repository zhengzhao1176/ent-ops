'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const KIND_LABEL: Record<string, string> = {
  PURCHASE: '采购入库',
  RETURN: '退货入库',
  TRANSFER: '调拨入库',
  STOCKTAKE: '盘盈入库',
  OTHER: '其他',
};

const STATUS_LABEL: Record<number, { text: string; cls: string }> = {
  10: { text: '草稿', cls: 'badge-info' },
  20: { text: '待审核', cls: 'badge-warning' },
  30: { text: '已审核', cls: 'badge-success' },
  40: { text: '已完成', cls: 'badge-success' },
  90: { text: '已作废', cls: 'badge-danger' },
};

export default function InboundListPage() {
  const [kind, setKind] = useState<string>('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const warehouses = trpc.warehouse.list.useQuery({ page: 1, pageSize: 200 });
  const list = trpc.inbound.list.useQuery({
    page,
    pageSize: 20,
    kind: (kind || undefined) as 'PURCHASE' | 'RETURN' | 'TRANSFER' | 'STOCKTAKE' | 'OTHER' | undefined,
    warehouseId: warehouseId ? BigInt(warehouseId) : undefined,
    status: (status ? Number(status) : undefined) as 10 | 20 | 30 | 40 | 90 | undefined,
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">入库管理</h1>
        <Link href="/inv/inbound/new" data-testid="btn-new-inbound" className="btn btn-primary">新建入库单</Link>
      </div>
      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 flex gap-3 flex-wrap">
        <select
          data-testid="select-kind"
          className="input max-w-[10rem]"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">全部类型</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          data-testid="select-warehouseId"
          className="input max-w-[14rem]"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
        >
          <option value="">全部仓库</option>
          {(warehouses.data?.items ?? []).map((w) => (
            <option key={String(w.id)} value={String(w.id)}>{w.name}</option>
          ))}
        </select>
        <select
          data-testid="select-status"
          className="input max-w-[10rem]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l.text}</option>
          ))}
        </select>
        <button data-testid="btn-search" className="btn btn-secondary" onClick={() => { setPage(1); list.refetch(); }}>查询</button>
      </div>
      <div className="bg-white rounded shadow border border-gray-100">
        <table data-testid="table-inbound" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">单号</th>
              <th className="px-4 py-2">类型</th>
              <th className="px-4 py-2">仓库ID</th>
              <th className="px-4 py-2">业务时间</th>
              <th className="px-4 py-2">来源单号</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((b) => {
              const s = STATUS_LABEL[b.status] ?? { text: String(b.status), cls: 'badge-info' };
              return (
                <tr key={String(b.id)} data-testid={`row-inbound-${b.id}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono">{b.docNo}</td>
                  <td className="px-4 py-2">{KIND_LABEL[b.kind] ?? b.kind}</td>
                  <td className="px-4 py-2 font-mono">{String(b.warehouseId)}</td>
                  <td className="px-4 py-2">{new Date(b.operationAt).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">{b.sourceDocNo ?? '-'}</td>
                  <td className="px-4 py-2">
                    <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Link
                      data-testid="btn-detail"
                      href={`/inv/inbound/${b.id}`}
                      className="text-brand-700 hover:underline text-xs"
                    >详情</Link>
                  </td>
                </tr>
              );
            })}
            {(list.data?.items ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{list.isLoading ? '加载中…' : '无数据'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-gray-500">共 {list.data?.total ?? 0} 条</span>
        <div className="space-x-2">
          <button data-testid="btn-prev" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span className="px-2">第 {page} 页</span>
          <button data-testid="btn-next" className="btn btn-secondary" disabled={(list.data?.items.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      </div>
    </AppShell>
  );
}
