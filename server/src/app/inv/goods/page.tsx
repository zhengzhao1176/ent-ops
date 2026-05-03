'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  ACTIVE: { text: '启用', cls: 'badge-success' },
  DISABLED: { text: '禁用', cls: 'badge-danger' },
};

export default function GoodsPage() {
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const cats = trpc.category.tree.useQuery();
  const list = trpc.goods.list.useQuery({
    page,
    pageSize: 20,
    keyword: keyword || undefined,
    categoryId: categoryId ? BigInt(categoryId) : undefined,
    status: (status || undefined) as 'ACTIVE' | 'DISABLED' | undefined,
  });
  const utils = trpc.useUtils();
  const del = trpc.goods.delete.useMutation({
    onSuccess: () => utils.goods.list.invalidate(),
  });
  const disable = trpc.goods.disable.useMutation({
    onSuccess: () => utils.goods.list.invalidate(),
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">商品管理</h1>
        <Link href="/inv/goods/new" data-testid="btn-new-goods" className="btn btn-primary">新建商品</Link>
      </div>
      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 flex gap-3 flex-wrap">
        <input
          data-testid="input-search"
          className="input max-w-xs"
          placeholder="搜索 编码/名称/条码"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          data-testid="select-categoryId"
          className="input max-w-[12rem]"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">全部分类</option>
          {(cats.data ?? []).map((c) => (
            <option key={String(c.id)} value={String(c.id)}>{c.name}</option>
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
        <table data-testid="table-goods" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">编码</th>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">规格</th>
              <th className="px-4 py-2">品牌</th>
              <th className="px-4 py-2">条码</th>
              <th className="px-4 py-2">安全库存</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((g) => {
              const s = STATUS_LABEL[g.status] ?? { text: g.status, cls: 'badge-info' };
              return (
                <tr key={String(g.id)} data-testid={`row-goods-${g.id}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono">{g.code}</td>
                  <td className="px-4 py-2">{g.name}</td>
                  <td className="px-4 py-2">{g.spec ?? '-'}</td>
                  <td className="px-4 py-2">{g.brand ?? '-'}</td>
                  <td className="px-4 py-2 font-mono">{g.barcode ?? '-'}</td>
                  <td className="px-4 py-2">{g.safetyStock ?? '-'}</td>
                  <td className="px-4 py-2">
                    <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Link
                      data-testid="btn-edit"
                      href={`/inv/goods/${g.id}`}
                      className="text-brand-700 hover:underline text-xs"
                    >编辑</Link>
                    {g.status !== 'DISABLED' && (
                      <button
                        data-testid="btn-disable"
                        className="text-orange-600 hover:underline text-xs"
                        onClick={() => { if (confirm('确定禁用该商品？')) disable.mutate({ id: g.id }); }}
                      >禁用</button>
                    )}
                    <button
                      data-testid="btn-delete"
                      className="text-red-600 hover:underline text-xs"
                      onClick={() => { if (confirm('确定删除该商品？')) del.mutate({ id: g.id }); }}
                    >删除</button>
                  </td>
                </tr>
              );
            })}
            {(list.data?.items ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{list.isLoading ? '加载中…' : '无数据'}</td></tr>
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
