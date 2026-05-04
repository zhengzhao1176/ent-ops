'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

type DeptItem = {
  id: bigint | string;
  code: string;
  name: string;
  parentId: bigint | string | null;
  path: string;
  depth: number;
  sort: number;
  status: 'ACTIVE' | 'DISABLED';
  remark: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  version: number;
};

type FormState =
  | { kind: 'closed' }
  | { kind: 'create'; parentId: string | null }
  | { kind: 'edit'; id: string; version: number };

type MoveState = { id: string; name: string } | null;

export default function DeptsPage() {
  const tree = trpc.department.tree.useQuery(undefined);
  const utils = trpc.useUtils();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [formData, setFormData] = useState({ code: '', name: '', sort: 0, remark: '' });
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [move, setMove] = useState<MoveState>(null);

  const create = trpc.department.create.useMutation({
    onSuccess: () => { utils.department.tree.invalidate(); closeForm(); },
    onError: (e) => setFormMsg(e.message),
  });
  const update = trpc.department.update.useMutation({
    onSuccess: () => { utils.department.tree.invalidate(); closeForm(); },
    onError: (e) => setFormMsg(e.message),
  });
  const del = trpc.department.delete.useMutation({
    onSuccess: () => utils.department.tree.invalidate(),
    onError: (e) => alert(e.message),
  });

  const flat = useMemo(() => (tree.data ?? []) as DeptItem[], [tree.data]);

  const sortedTopLevel = useMemo(() => {
    return flat
      .filter((d) => d.parentId === null || d.parentId === undefined)
      .slice()
      .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  }, [flat]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, DeptItem[]>();
    for (const d of flat) {
      if (d.parentId === null || d.parentId === undefined) continue;
      const key = String(d.parentId);
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
    }
    return map;
  }, [flat]);

  function openCreate(parentId: string | null) {
    setFormData({ code: '', name: '', sort: 0, remark: '' });
    setFormMsg(null);
    setForm({ kind: 'create', parentId });
  }
  function openEdit(d: DeptItem) {
    setFormData({ code: d.code, name: d.name, sort: d.sort, remark: d.remark ?? '' });
    setFormMsg(null);
    setForm({ kind: 'edit', id: String(d.id), version: d.version });
  }
  function closeForm() {
    setForm({ kind: 'closed' });
    setFormData({ code: '', name: '', sort: 0, remark: '' });
    setFormMsg(null);
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    if (form.kind === 'create') {
      if (!formData.code.trim() || !formData.name.trim()) {
        setFormMsg('编码和名称不能为空');
        return;
      }
      create.mutate({
        code: formData.code,
        name: formData.name,
        sort: Number(formData.sort) || 0,
        remark: formData.remark || undefined,
        parentId: form.parentId ?? undefined,
      });
    } else if (form.kind === 'edit') {
      if (!formData.name.trim()) {
        setFormMsg('名称不能为空');
        return;
      }
      update.mutate({
        id: form.id,
        version: form.version,
        name: formData.name,
        sort: Number(formData.sort) || 0,
        remark: formData.remark || undefined,
      });
    }
  }

  function renderNode(d: DeptItem) {
    const id = String(d.id);
    const kids = childrenMap.get(id) ?? [];
    const childCount = kids.length;
    const selected = selectedId === id;
    return (
      <div key={id}>
        <div
          data-testid={`row-dept-${id}`}
          className={`flex items-center justify-between border-t border-gray-100 px-3 py-2 cursor-pointer ${selected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
          style={{ paddingLeft: `${12 + d.depth * 20}px` }}
          onClick={() => setSelectedId(id)}
        >
          <div className="flex items-center gap-3">
            <span className="font-medium">{d.name}</span>
            <span className="font-mono text-xs text-gray-500">{d.code}</span>
            <span className="text-xs text-gray-500">子部门: {childCount}</span>
            {d.status === 'DISABLED' && <span className="badge badge-danger">已停用</span>}
          </div>
          <div className="space-x-2 text-xs">
            <button
              data-testid={`btn-add-child-${id}`}
              className="text-brand-700 hover:underline"
              onClick={(e) => { e.stopPropagation(); setSelectedId(id); openCreate(id); }}
            >新增子部门</button>
            <button
              data-testid={`btn-edit-dept-${id}`}
              className="text-brand-700 hover:underline"
              onClick={(e) => { e.stopPropagation(); setSelectedId(id); openEdit(d); }}
            >编辑</button>
            <button
              data-testid={`btn-move-dept-${id}`}
              className="text-brand-700 hover:underline"
              onClick={(e) => { e.stopPropagation(); setMove({ id, name: d.name }); }}
            >移动</button>
            <button
              data-testid={`btn-delete-dept-${id}`}
              className="text-red-600 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
              disabled={del.isPending}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`确定删除部门「${d.name}」？\n（若仍有子部门或用户将由后端拒绝）`)) {
                  del.mutate({ id });
                }
              }}
            >删除</button>
          </div>
        </div>
        {kids.map(renderNode)}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">部门管理</h1>
        <button
          data-testid="btn-new-dept"
          className="btn btn-primary"
          onClick={() => openCreate(null)}
          disabled={form.kind !== 'closed'}
        >新建顶层部门</button>
      </div>

      {form.kind !== 'closed' && (
        <form
          data-testid="form-dept"
          onSubmit={onSave}
          className="bg-white rounded shadow border border-gray-100 mb-4 p-4 grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          <div className="md:col-span-4 text-xs text-gray-500">
            {form.kind === 'create'
              ? form.parentId
                ? `新增子部门，父部门 ID: ${form.parentId}`
                : '新建顶层部门'
              : `编辑部门 ID: ${form.id}`}
          </div>
          <div>
            <label className="label">编码</label>
            <input
              data-testid="input-dept-code"
              className="input"
              value={formData.code}
              disabled={form.kind === 'edit'}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            />
          </div>
          <div>
            <label className="label">名称</label>
            <input
              data-testid="input-dept-name"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">排序</label>
            <input
              data-testid="input-dept-sort"
              className="input"
              type="number"
              value={formData.sort}
              onChange={(e) => setFormData({ ...formData, sort: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">备注</label>
            <input
              data-testid="input-dept-remark"
              className="input"
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
            />
          </div>
          {formMsg && (
            <p data-testid="form-msg" className="md:col-span-4 text-sm text-red-600">{formMsg}</p>
          )}
          <div className="md:col-span-4 flex gap-2 pt-1">
            <button
              type="submit"
              data-testid="btn-save-dept"
              className="btn btn-primary"
              disabled={create.isPending || update.isPending}
            >保存</button>
            <button
              type="button"
              data-testid="btn-cancel-dept"
              className="btn btn-secondary"
              onClick={closeForm}
            >取消</button>
          </div>
        </form>
      )}

      <div data-testid="tree-depts" className="bg-white rounded shadow border border-gray-100">
        {tree.isLoading && <p className="p-4 text-gray-500">加载中…</p>}
        {tree.isError && <p className="p-4 text-red-600">{tree.error.message}</p>}
        {!tree.isLoading && !tree.isError && sortedTopLevel.length === 0 && (
          <p className="p-8 text-center text-gray-500">尚无部门，点右上角新建一个吧</p>
        )}
        {sortedTopLevel.map(renderNode)}
      </div>

      {move && (
        <MoveDeptDialog
          id={move.id}
          name={move.name}
          allDepts={flat}
          onClose={() => setMove(null)}
          onMoved={() => { setMove(null); utils.department.tree.invalidate(); }}
        />
      )}
    </AppShell>
  );
}

function MoveDeptDialog({
  id,
  name,
  allDepts,
  onClose,
  onMoved,
}: {
  id: string;
  name: string;
  allDepts: DeptItem[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [target, setTarget] = useState<string>('');
  const [msg, setMsg] = useState<string | null>(null);
  const move = trpc.department.move.useMutation({
    onSuccess: () => onMoved(),
    onError: (e) => setMsg(e.message),
  });

  function onConfirm() {
    setMsg(null);
    move.mutate({ id, newParentId: target || undefined });
  }

  return (
    <div
      data-testid="modal-move-dept"
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow border border-gray-200 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="font-semibold">移动部门 — {name}</div>
          <div className="text-xs text-gray-500">选择新的父部门；不选则移到顶层。后端会校验非法目标。</div>
        </div>
        <div className="p-4 space-y-2">
          <label className="label">新父部门</label>
          <select
            data-testid="select-new-parent"
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">— 顶层 —</option>
            {allDepts
              .filter((d) => String(d.id) !== id)
              .map((d) => (
                <option key={String(d.id)} value={String(d.id)}>
                  {`${'· '.repeat(d.depth)}${d.name} (${d.code})`}
                </option>
              ))}
          </select>
          {msg && <p data-testid="move-msg" className="text-sm text-red-600">{msg}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            data-testid="btn-cancel-move"
            className="btn btn-secondary"
            onClick={onClose}
          >取消</button>
          <button
            data-testid="btn-confirm-move"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={move.isPending}
          >确认移动</button>
        </div>
      </div>
    </div>
  );
}
