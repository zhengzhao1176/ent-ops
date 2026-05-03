'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING: { text: '待激活', cls: 'badge-warning' },
  ACTIVE: { text: '启用', cls: 'badge-success' },
  DISABLED: { text: '禁用', cls: 'badge-danger' },
  LOCKED: { text: '锁定', cls: 'badge-danger' },
  DELETED: { text: '已注销', cls: 'badge-info' },
};

export default function UsersPage() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const list = trpc.user.list.useQuery({
    page,
    pageSize: 20,
    keyword: keyword || undefined,
    status: (status || undefined) as 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'DELETED' | undefined,
  });
  const utils = trpc.useUtils();
  const reset = trpc.user.resetPassword.useMutation({
    onSuccess: () => { utils.user.list.invalidate(); alert('已重置初始密码'); },
  });
  const deactivate = trpc.user.deactivate.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
  });

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">用户管理</h1>
        <Link href="/admin/users/new" data-testid="btn-new-user" className="btn btn-primary">新建用户</Link>
      </div>
      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 flex gap-3">
        <input
          data-testid="input-search"
          className="input max-w-xs"
          placeholder="搜索 工号/姓名/手机号/邮箱"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
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
        <table data-testid="table-users" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">工号</th>
              <th className="px-4 py-2">用户名</th>
              <th className="px-4 py-2">姓名</th>
              <th className="px-4 py-2">手机</th>
              <th className="px-4 py-2">邮箱</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((u) => {
              const s = STATUS_LABEL[u.status] ?? { text: u.status, cls: 'badge-info' };
              return (
                <tr key={String(u.id)} data-testid={`row-user-${u.id}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono">{u.employeeNo}</td>
                  <td className="px-4 py-2">{u.username}</td>
                  <td className="px-4 py-2">{u.realName}</td>
                  <td className="px-4 py-2 font-mono">{u.mobile}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">
                    <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Link href={`/admin/users/${u.id}`} className="text-brand-700 hover:underline text-xs">编辑</Link>
                    <button
                      data-testid="btn-reset-password"
                      className="text-orange-600 hover:underline text-xs"
                      onClick={() => { if (confirm('重置该用户密码？')) reset.mutate({ userId: u.id }); }}
                    >重置密码</button>
                    {u.status !== 'DISABLED' && (
                      <button
                        data-testid="btn-deactivate"
                        className="text-red-600 hover:underline text-xs"
                        onClick={() => { if (confirm('确定禁用该用户？')) deactivate.mutate({ id: u.id }); }}
                      >禁用</button>
                    )}
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
