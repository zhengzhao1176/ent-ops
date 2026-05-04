'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

export default function EditGoodsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = BigInt(params.id);
  const detail = trpc.goods.detail.useQuery({ id });
  const cats = trpc.category.tree.useQuery();
  const update = trpc.goods.update.useMutation();
  const [form, setForm] = useState({
    name: '',
    categoryId: '',
    spec: '',
    brand: '',
    barcode: '',
    safetyStock: '',
    stockUpper: '',
  });
  const [version, setVersion] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data) {
      setForm({
        name: detail.data.name ?? '',
        categoryId: String(detail.data.categoryId),
        spec: detail.data.spec ?? '',
        brand: detail.data.brand ?? '',
        barcode: detail.data.barcode ?? '',
        safetyStock: detail.data.safetyStock ?? '',
        stockUpper: detail.data.stockUpper ?? '',
      });
      setVersion(detail.data.version);
    }
  }, [detail.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      await update.mutateAsync({
        id,
        version,
        name: form.name || undefined,
        categoryId: form.categoryId ? BigInt(form.categoryId) : undefined,
        spec: form.spec || undefined,
        brand: form.brand || undefined,
        barcode: form.barcode || undefined,
        safetyStock: form.safetyStock || undefined,
        stockUpper: form.stockUpper || undefined,
      });
      setSuccess('保存成功');
      setTimeout(() => router.push('/inv/goods'), 500);
    } catch (e) { setError((e as Error).message); }
  }

  if (detail.isLoading) return <AppShell><p>加载中…</p></AppShell>;
  if (detail.isError) return <AppShell><p className="text-red-600">{detail.error.message}</p></AppShell>;

  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">编辑商品 #{params.id}</h1>
      <form onSubmit={onSubmit} className="bg-white rounded shadow border border-gray-100 p-6 max-w-xl space-y-4">
        <div><label className="label">编码</label><input className="input" value={detail.data?.code ?? ''} disabled /></div>
        <div><label className="label">名称</label><input data-testid="input-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div>
          <label className="label">分类</label>
          <select data-testid="select-categoryId" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">请选择</option>
            {(cats.data ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label">规格</label><input data-testid="input-spec" className="input" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} /></div>
        <div><label className="label">品牌</label><input data-testid="input-brand" className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
        <div><label className="label">条码</label><input data-testid="input-barcode" className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></div>
        <div><label className="label">安全库存</label><input data-testid="input-safetyStock" className="input" value={form.safetyStock} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} /></div>
        <div><label className="label">库存上限</label><input data-testid="input-stockUpper" className="input" value={form.stockUpper} onChange={(e) => setForm({ ...form, stockUpper: e.target.value })} /></div>
        {error && <p data-testid="error-msg" className="text-red-600 text-sm">{error}</p>}
        {success && <p data-testid="success-msg" role="status" className="text-green-600 text-sm">{success}</p>}
        <p className="text-xs text-gray-500">版本号 v{version}（保存时进行乐观锁校验）</p>
        <div className="flex gap-3 pt-2">
          <button data-testid="btn-submit" className="btn btn-primary" disabled={update.isPending}>保存</button>
          <button data-testid="btn-cancel" type="button" className="btn btn-secondary" onClick={() => router.back()}>取消</button>
        </div>
      </form>
    </AppShell>
  );
}
