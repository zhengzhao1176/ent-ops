'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const KIND_OPTIONS: { value: 'FULL' | 'SAMPLING' | 'DYNAMIC'; label: string }[] = [
  { value: 'FULL', label: '全量盘点' },
  { value: 'SAMPLING', label: '抽样盘点' },
  { value: 'DYNAMIC', label: '动态盘点' },
];

export default function NewStocktakePage() {
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const warehouses = trpc.warehouse.list.useQuery({ page: 1, pageSize: 200 });
  const create = trpc.stocktake.create.useMutation();

  const [kind, setKind] = useState<'FULL' | 'SAMPLING' | 'DYNAMIC'>('FULL');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [remark, setRemark] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!warehouseId) { setError('请选择仓库'); return; }
    if (!me.data) { setError('未识别当前操作员'); return; }
    try {
      // Header-only create. Lines come from the freeze (10->20) snapshot.
      await create.mutateAsync({
        kind,
        warehouseId,
        operatorId: me.data.id,
        operationAt: new Date(),
        reason: reason || undefined,
        remark: remark || undefined,
      });
      setSuccess('草稿已保存');
      setTimeout(() => router.push('/inv/stocktake'), 500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">新建盘点单</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="bg-white rounded shadow border border-gray-100 p-6 grid grid-cols-2 gap-4 max-w-3xl">
          <Field label="盘点类型">
            <select data-testid="select-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="仓库">
            <select data-testid="select-warehouseId" className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">请选择</option>
              {(warehouses.data?.items ?? []).map((w) => (
                <option key={String(w.id)} value={String(w.id)}>{w.name}</option>
              ))}
            </select>
          </Field>
          <Field label="原因">
            <input data-testid="input-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <label className="label">备注</label>
            <input data-testid="input-remark" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>

        <div className="bg-white rounded shadow border border-gray-100 p-6 max-w-3xl">
          <p className="text-sm text-gray-600">
            盘点明细将在执行 <span className="font-semibold">冻结</span> 操作时根据当前库存快照自动生成，无需在此手工录入。
          </p>
        </div>

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
