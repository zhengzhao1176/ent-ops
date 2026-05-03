'use client';

import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

export default function StockPage() {
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [goodsId, setGoodsId] = useState<string>('');
  const [batchNo, setBatchNo] = useState<string>('');
  const [page, setPage] = useState(1);

  const warehouses = trpc.warehouse.list.useQuery({ page: 1, pageSize: 200 });
  const goods = trpc.goods.list.useQuery({ page: 1, pageSize: 200 });
  // Keep ids as strings: react-query hashes the queryKey via JSON.stringify,
  // which throws on bigint. The BigIntId zod schema accepts string and
  // transforms to bigint server-side.
  const list = trpc.stock.list.useQuery({
    page,
    pageSize: 20,
    warehouseId: warehouseId || undefined,
    goodsId: goodsId || undefined,
    batchNo: batchNo || undefined,
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">库存查询</h1>
      </div>
      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 flex gap-3 flex-wrap">
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
          data-testid="select-goodsId"
          className="input max-w-[14rem]"
          value={goodsId}
          onChange={(e) => setGoodsId(e.target.value)}
        >
          <option value="">全部商品</option>
          {(goods.data?.items ?? []).map((g) => (
            <option key={String(g.id)} value={String(g.id)}>{g.name}</option>
          ))}
        </select>
        <input
          data-testid="input-batchNo"
          className="input max-w-xs"
          placeholder="批次号"
          value={batchNo}
          onChange={(e) => setBatchNo(e.target.value)}
        />
        <button data-testid="btn-search" className="btn btn-secondary" onClick={() => { setPage(1); list.refetch(); }}>查询</button>
      </div>
      <div className="bg-white rounded shadow border border-gray-100">
        <table data-testid="table-stock" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">仓库ID</th>
              <th className="px-4 py-2">库位ID</th>
              <th className="px-4 py-2">商品ID</th>
              <th className="px-4 py-2">批次号</th>
              <th className="px-4 py-2">现存量</th>
              <th className="px-4 py-2">锁定量</th>
              <th className="px-4 py-2">可用量</th>
              <th className="px-4 py-2">在途量</th>
              <th className="px-4 py-2">到期日</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((s) => (
              <tr key={String(s.id)} data-testid={`row-stock-${s.id}`} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono">{String(s.warehouseId)}</td>
                <td className="px-4 py-2 font-mono">{String(s.locationId)}</td>
                <td className="px-4 py-2 font-mono">{String(s.goodsId)}</td>
                <td className="px-4 py-2 font-mono">{s.batchNo}</td>
                <td className="px-4 py-2" data-testid="cell-qtyOnHand">{s.qtyOnHand}</td>
                <td className="px-4 py-2" data-testid="cell-qtyLocked">{s.qtyLocked}</td>
                <td className="px-4 py-2" data-testid="cell-qtyAvailable">{s.qtyAvailable}</td>
                <td className="px-4 py-2">{s.qtyInTransit}</td>
                <td className="px-4 py-2">{s.expireAt ? new Date(s.expireAt).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {(list.data?.items ?? []).length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">{list.isLoading ? '加载中…' : '无数据'}</td></tr>
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
