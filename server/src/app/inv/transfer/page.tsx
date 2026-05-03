'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const KIND_LABEL: Record<string, string> = {
  INTERNAL: '内部调拨',
  RETURN: '退仓调拨',
  ADJUSTMENT: '调整调拨',
};

const STATUS_LABEL: Record<number, { text: string; cls: string }> = {
  10: { text: '草稿', cls: 'badge-info' },
  20: { text: '待审核', cls: 'badge-warning' },
  25: { text: '已发出', cls: 'badge-warning' },
  30: { text: '已收货', cls: 'badge-success' },
  40: { text: '已完成', cls: 'badge-success' },
  90: { text: '已作废', cls: 'badge-danger' },
};

export default function TransferListPage() {
  const [kind, setKind] = useState<string>('');
  const [fromWarehouseId, setFromWarehouseId] = useState<string>('');
  const [toWarehouseId, setToWarehouseId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const warehouses = trpc.warehouse.list.useQuery({ page: 1, pageSize: 200 });
  const list = trpc.transfer.list.useQuery({
    page,
    pageSize: 20,
    kind: (kind || undefined) as 'INTERNAL' | 'RETURN' | 'ADJUSTMENT' | undefined,
    // Keep ids as strings: react-query hashes the queryKey via JSON.stringify,
    // which throws on bigint. The BigIntId zod schema accepts string and
    // transforms to bigint server-side.
    fromWarehouseId: fromWarehouseId || undefined,
    toWarehouseId: toWarehouseId || undefined,
    status: (status ? Number(status) : undefined) as 10 | 20 | 25 | 30 | 40 | 90 | undefined,
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">调拨管理</h1>
        <Link href="/inv/transfer/new" data-testid="btn-new-transfer" className="btn btn-primary">新建调拨单</Link>
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
          data-testid="select-fromWarehouseId"
          className="input max-w-[14rem]"
          value={fromWarehouseId}
          onChange={(e) => setFromWarehouseId(e.target.value)}
        >
          <option value="">全部源仓库</option>
          {(warehouses.data?.items ?? []).map((w) => (
            <option key={String(w.id)} value={String(w.id)}>{w.name}</option>
          ))}
        </select>
        <select
          data-testid="select-toWarehouseId"
          className="input max-w-[14rem]"
          value={toWarehouseId}
          onChange={(e) => setToWarehouseId(e.target.value)}
        >
          <option value="">全部目标仓库</option>
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
        <table data-testid="table-transfer" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">单号</th>
              <th className="px-4 py-2">类型</th>
              <th className="px-4 py-2">源仓库ID</th>
              <th className="px-4 py-2">目标仓库ID</th>
              <th className="px-4 py-2">业务时间</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((b) => {
              const s = STATUS_LABEL[b.status] ?? { text: String(b.status), cls: 'badge-info' };
              return (
                <tr key={String(b.id)} data-testid={`row-transfer-${b.id}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono">{b.docNo}</td>
                  <td className="px-4 py-2">{KIND_LABEL[b.kind] ?? b.kind}</td>
                  <td className="px-4 py-2 font-mono">{String(b.fromWarehouseId)}</td>
                  <td className="px-4 py-2 font-mono">{String(b.toWarehouseId)}</td>
                  <td className="px-4 py-2">{new Date(b.operationAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Link
                      data-testid="btn-detail"
                      href={`/inv/transfer/${b.id}`}
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
