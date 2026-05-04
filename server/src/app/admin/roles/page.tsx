'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

type RoleItem = {
  id: bigint | string;
  code: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  version: number;
};

type FormMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; id: string; version: number };

type AssignState = { id: string; name: string } | null;

const ROLE_CODE_RE = /^ROLE_[A-Z0-9_]+$/;

export default function RolesPage() {
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const list = trpc.role.list.useQuery({
    page,
    pageSize: 20,
    keyword: keyword || undefined,
  });
  const utils = trpc.useUtils();

  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [assign, setAssign] = useState<AssignState>(null);

  const create = trpc.role.create.useMutation({
    onSuccess: () => {
      utils.role.list.invalidate();
      setMode({ kind: 'closed' });
      setForm({ code: '', name: '', description: '' });
      setFormMsg(null);
    },
    onError: (e) => setFormMsg(e.message),
  });
  const update = trpc.role.update.useMutation({
    onSuccess: () => {
      utils.role.list.invalidate();
      setMode({ kind: 'closed' });
      setForm({ code: '', name: '', description: '' });
      setFormMsg(null);
    },
    onError: (e) => setFormMsg(e.message),
  });
  const del = trpc.role.delete.useMutation({
    onSuccess: () => utils.role.list.invalidate(),
    onError: (e) => alert(e.message),
  });

  function openCreate() {
    setForm({ code: '', name: '', description: '' });
    setFormMsg(null);
    setMode({ kind: 'create' });
  }
  function openEdit(r: RoleItem) {
    setForm({ code: r.code, name: r.name, description: r.description ?? '' });
    setFormMsg(null);
    setMode({ kind: 'edit', id: String(r.id), version: r.version });
  }
  function cancelForm() {
    setMode({ kind: 'closed' });
    setForm({ code: '', name: '', description: '' });
    setFormMsg(null);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    if (mode.kind === 'create') {
      if (!ROLE_CODE_RE.test(form.code)) {
        setFormMsg('角色编码须以 ROLE_ 开头，仅允许大写字母/数字/下划线');
        return;
      }
      if (!form.name.trim()) {
        setFormMsg('角色名称不能为空');
        return;
      }
      create.mutate({
        code: form.code,
        name: form.name,
        description: form.description || undefined,
      });
    } else if (mode.kind === 'edit') {
      if (!form.name.trim()) {
        setFormMsg('角色名称不能为空');
        return;
      }
      update.mutate({
        id: mode.id,
        version: mode.version,
        name: form.name,
        description: form.description || undefined,
      });
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">角色管理</h1>
        <button
          data-testid="btn-new-role"
          className="btn btn-primary"
          onClick={openCreate}
          disabled={mode.kind !== 'closed'}
        >新建角色</button>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 flex gap-3">
        <input
          data-testid="input-search"
          className="input max-w-xs"
          placeholder="搜索 编码/名称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          data-testid="btn-search"
          className="btn btn-secondary"
          onClick={() => { setPage(1); list.refetch(); }}
        >查询</button>
      </div>

      {mode.kind !== 'closed' && (
        <form
          data-testid="form-role"
          onSubmit={onSave}
          className="bg-white rounded shadow border border-gray-100 mb-4 p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div>
            <label className="label">角色编码</label>
            <input
              data-testid="input-role-code"
              className="input"
              placeholder="ROLE_XXX"
              value={form.code}
              disabled={mode.kind === 'edit'}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="label">角色名称</label>
            <input
              data-testid="input-role-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">描述</label>
            <input
              data-testid="input-role-description"
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {formMsg && (
            <p data-testid="form-msg" className="md:col-span-3 text-sm text-red-600">{formMsg}</p>
          )}
          <div className="md:col-span-3 flex gap-2 pt-1">
            <button
              type="submit"
              data-testid="btn-save-role"
              className="btn btn-primary"
              disabled={create.isPending || update.isPending}
            >保存</button>
            <button
              type="button"
              data-testid="btn-cancel-role"
              className="btn btn-secondary"
              onClick={cancelForm}
            >取消</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded shadow border border-gray-100">
        <table data-testid="table-roles" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">编码</th>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">描述</th>
              <th className="px-4 py-2">是否内置</th>
              <th className="px-4 py-2">创建时间</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((r) => {
              const id = String(r.id);
              return (
                <tr key={id} data-testid={`row-role-${id}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono">{r.code}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.description ?? ''}</td>
                  <td className="px-4 py-2">
                    {r.isBuiltin
                      ? <span className="badge badge-info">内置</span>
                      : <span className="badge badge-success">自定义</span>}
                  </td>
                  <td className="px-4 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      data-testid={`btn-edit-role-${id}`}
                      className="text-brand-700 hover:underline text-xs"
                      onClick={() => openEdit(r as unknown as RoleItem)}
                    >编辑</button>
                    <button
                      data-testid={`btn-assign-perms-${id}`}
                      className="text-brand-700 hover:underline text-xs"
                      onClick={() => setAssign({ id, name: r.name })}
                    >分配权限</button>
                    <button
                      data-testid={`btn-delete-role-${id}`}
                      className="text-red-600 hover:underline text-xs disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                      disabled={r.isBuiltin || del.isPending}
                      onClick={() => {
                        if (r.isBuiltin) return;
                        if (confirm(`确定删除角色「${r.name}」？`)) del.mutate({ id });
                      }}
                    >删除</button>
                  </td>
                </tr>
              );
            })}
            {(list.data?.items ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{list.isLoading ? '加载中…' : '无数据'}</td></tr>
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

      {assign && (
        <AssignPermsPanel
          roleId={assign.id}
          roleName={assign.name}
          onClose={() => setAssign(null)}
        />
      )}
    </AppShell>
  );
}

function AssignPermsPanel({
  roleId,
  roleName,
  onClose,
}: {
  roleId: string;
  roleName: string;
  onClose: () => void;
}) {
  const perms = trpc.permission.list.useQuery(undefined);
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const assign = trpc.role.assignPermissions.useMutation({
    onSuccess: () => {
      utils.role.list.invalidate();
      setMsg('已保存。注意：当前列表不反映已存在的分配（仅在保存后生效）。');
    },
    onError: (e) => setMsg(e.message),
  });

  const items = useMemo(() => {
    const all = perms.data ?? [];
    if (!keyword) return all;
    const k = keyword.toLowerCase();
    return all.filter((p) => p.code.toLowerCase().includes(k) || p.name.toLowerCase().includes(k));
  }, [perms.data, keyword]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function onSave() {
    setMsg(null);
    assign.mutate({ roleId, permissionIds: Array.from(selected) });
  }

  return (
    <div
      data-testid="modal-assign-perms"
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow border border-gray-200 w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="font-semibold">分配权限 — {roleName}</div>
            <div className="text-xs text-gray-500">勾选后保存，将以勾选项作为该角色的全部权限（覆盖式）。</div>
          </div>
          <button
            data-testid="btn-close-assign-perms"
            className="text-gray-500 hover:text-gray-800 text-sm"
            onClick={onClose}
          >关闭</button>
        </div>
        <div className="px-4 py-2 border-b border-gray-100">
          <input
            data-testid="input-perm-search"
            className="input"
            placeholder="搜索权限 code/名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-auto p-4">
          {perms.isLoading && <p className="text-gray-500">加载权限列表…</p>}
          {perms.isError && <p className="text-red-600">{perms.error.message}</p>}
          {!perms.isLoading && !perms.isError && (
            <ul data-testid="list-perms" className="space-y-1">
              {items.map((p) => {
                const id = String(p.id);
                return (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid={`chk-perm-${id}`}
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                    />
                    <span className="font-mono text-xs text-gray-500">{p.kind}</span>
                    <span className="font-mono">{p.code}</span>
                    <span className="text-gray-700">— {p.name}</span>
                  </li>
                );
              })}
              {items.length === 0 && (
                <li className="text-gray-500">无匹配权限</li>
              )}
            </ul>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span data-testid="assign-msg" className="text-xs text-gray-600">{msg ?? `已选 ${selected.size} 项`}</span>
          <div className="space-x-2">
            <button
              data-testid="btn-cancel-assign"
              className="btn btn-secondary"
              onClick={onClose}
            >取消</button>
            <button
              data-testid="btn-save-assign"
              className="btn btn-primary"
              onClick={onSave}
              disabled={assign.isPending}
            >保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
