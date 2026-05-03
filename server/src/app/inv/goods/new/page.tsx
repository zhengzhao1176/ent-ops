'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

export default function NewGoodsPage() {
  const router = useRouter();
  const cats = trpc.category.tree.useQuery();
  const units = trpc.unit.list.useQuery();
  const create = trpc.goods.create.useMutation();
  const [form, setForm] = useState({
    code: '',
    name: '',
    categoryId: '',
    unitId: '',
    spec: '',
    brand: '',
    barcode: '',
    safetyStock: '',
    stockUpper: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      if (!form.categoryId) { setError('请选择分类'); return; }
      if (!form.unitId) { setError('请选择单位'); return; }
      await create.mutateAsync({
        code: form.code,
        name: form.name,
        categoryId: BigInt(form.categoryId),
        unitId: BigInt(form.unitId),
        spec: form.spec || undefined,
        brand: form.brand || undefined,
        barcode: form.barcode || undefined,
        safetyStock: form.safetyStock || undefined,
        stockUpper: form.stockUpper || undefined,
      });
      setSuccess('创建成功');
      setTimeout(() => router.push('/inv/goods'), 500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">新建商品</h1>
      <form onSubmit={onSubmit} className="bg-white rounded shadow border border-gray-100 p-6 max-w-xl space-y-4">
        <Field label="编码"><input data-testid="input-code" className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="名称"><input data-testid="input-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="分类">
          <select data-testid="select-categoryId" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">请选择</option>
            {(cats.data ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="单位">
          <select data-testid="select-unitId" className="input" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
            <option value="">请选择</option>
            {(units.data ?? []).map((u) => <option key={String(u.id)} value={String(u.id)}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="规格"><input data-testid="input-spec" className="input" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} /></Field>
        <Field label="品牌"><input data-testid="input-brand" className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
        <Field label="条码"><input data-testid="input-barcode" className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
        <Field label="安全库存"><input data-testid="input-safetyStock" className="input" placeholder="如 10 或 10.5000" value={form.safetyStock} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} /></Field>
        <Field label="库存上限"><input data-testid="input-stockUpper" className="input" placeholder="如 1000" value={form.stockUpper} onChange={(e) => setForm({ ...form, stockUpper: e.target.value })} /></Field>
        {error && <p data-testid="error-msg" className="text-red-600 text-sm">{error}</p>}
        {success && <p data-testid="success-msg" role="status" className="text-green-600 text-sm">{success}</p>}
        <div className="flex gap-3 pt-2">
          <button data-testid="btn-submit" className="btn btn-primary" type="submit" disabled={create.isPending}>提交</button>
          <button data-testid="btn-cancel" className="btn btn-secondary" type="button" onClick={() => router.back()}>取消</button>
        </div>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
