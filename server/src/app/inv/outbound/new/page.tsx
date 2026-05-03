'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

type LineForm = {
  goodsId: string;
  locationId: string;
  qty: string;
  batchNo: string;
};

const KIND_OPTIONS: { value: 'SALES' | 'USE' | 'TRANSFER' | 'STOCKTAKE' | 'DAMAGE' | 'OTHER'; label: string }[] = [
  { value: 'SALES', label: '销售出库' },
  { value: 'USE', label: '领用出库' },
  { value: 'TRANSFER', label: '调拨出库' },
  { value: 'STOCKTAKE', label: '盘亏出库' },
  { value: 'DAMAGE', label: '报损出库' },
  { value: 'OTHER', label: '其他' },
];

const PICK_STRATEGIES: { value: 'FIFO' | 'FEFO' | 'MANUAL'; label: string }[] = [
  { value: 'FIFO', label: 'FIFO（先进先出）' },
  { value: 'FEFO', label: 'FEFO（先到期先出）' },
  { value: 'MANUAL', label: '手动指定' },
];

function emptyLine(): LineForm {
  return { goodsId: '', locationId: '', qty: '', batchNo: '' };
}

export default function NewOutboundPage() {
  const router = useRouter();
  const me = trpc.auth.me.useQuery();
  const warehouses = trpc.warehouse.list.useQuery({ page: 1, pageSize: 200 });
  const goods = trpc.goods.list.useQuery({ page: 1, pageSize: 200 });
  const create = trpc.outbound.create.useMutation();

  const [kind, setKind] = useState<'SALES' | 'USE' | 'TRANSFER' | 'STOCKTAKE' | 'DAMAGE' | 'OTHER'>('SALES');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [pickStrategy, setPickStrategy] = useState<'FIFO' | 'FEFO' | 'MANUAL'>('FIFO');
  const [targetDocNo, setTargetDocNo] = useState<string>('');
  const [applicantId, setApplicantId] = useState<string>('');
  const [remark, setRemark] = useState<string>('');
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Keep ids as strings: react-query hashes the queryKey via JSON.stringify,
  // which throws on bigint. The BigIntId zod schema accepts string and
  // transforms to bigint server-side.
  const locations = trpc.location.list.useQuery(
    { page: 1, pageSize: 200, warehouseId: warehouseId || undefined },
    { enabled: Boolean(warehouseId) },
  );
  const locItems = useMemo(() => locations.data?.items ?? [], [locations.data]);

  function setLine(idx: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!warehouseId) { setError('请选择仓库'); return; }
    if (!me.data) { setError('未识别当前操作员'); return; }
    const cleaned = lines.filter((l) => l.goodsId && l.locationId && l.qty);
    if (cleaned.length === 0) { setError('至少添加一条明细'); return; }
    for (const l of cleaned) {
      if (!/^-?\d+(\.\d{1,4})?$/.test(l.qty)) {
        setError('数量需为 ≤4 位小数'); return;
      }
    }
    try {
      await create.mutateAsync({
        kind,
        warehouseId,
        applicantId: applicantId || undefined,
        operatorId: me.data.id,
        operationAt: new Date(),
        pickStrategy,
        targetDocNo: targetDocNo || undefined,
        remark: remark || undefined,
        lines: cleaned.map((l) => ({
          goodsId: l.goodsId,
          locationId: l.locationId,
          qty: l.qty,
          batchNo: l.batchNo || undefined,
        })),
      });
      setSuccess('草稿已保存');
      setTimeout(() => router.push('/inv/outbound'), 500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">新建出库单</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="bg-white rounded shadow border border-gray-100 p-6 grid grid-cols-2 gap-4 max-w-3xl">
          <Field label="出库类型">
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
          <Field label="拣货策略">
            <select data-testid="select-pickStrategy" className="input" value={pickStrategy} onChange={(e) => setPickStrategy(e.target.value as typeof pickStrategy)}>
              {PICK_STRATEGIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="目标单号">
            <input data-testid="input-targetDocNo" className="input" value={targetDocNo} onChange={(e) => setTargetDocNo(e.target.value)} />
          </Field>
          <Field label="申请人ID（可选）">
            <input data-testid="input-applicantId" className="input" value={applicantId} onChange={(e) => setApplicantId(e.target.value)} placeholder="留空则忽略" />
          </Field>
          <div className="col-span-2">
            <label className="label">备注</label>
            <input data-testid="input-remark" className="input" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </div>

        <div className="bg-white rounded shadow border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">明细</h2>
            <button type="button" data-testid="btn-add-line" className="btn btn-secondary text-xs" onClick={addLine}>新增明细行</button>
          </div>
          <table data-testid="table-lines" className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-2 py-2">商品</th>
                <th className="px-2 py-2">库位</th>
                <th className="px-2 py-2">数量</th>
                <th className="px-2 py-2">批次号</th>
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} data-testid={`row-line-${idx}`} className="border-t border-gray-100">
                  <td className="px-2 py-2">
                    <select
                      data-testid={`select-line${idx}-goods`}
                      className="input"
                      value={l.goodsId}
                      onChange={(e) => setLine(idx, { goodsId: e.target.value })}
                    >
                      <option value="">请选择</option>
                      {(goods.data?.items ?? []).map((g) => (
                        <option key={String(g.id)} value={String(g.id)}>{g.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      data-testid={`select-line${idx}-location`}
                      className="input"
                      value={l.locationId}
                      onChange={(e) => setLine(idx, { locationId: e.target.value })}
                      disabled={!warehouseId}
                    >
                      <option value="">请选择</option>
                      {locItems.map((loc) => (
                        <option key={String(loc.id)} value={String(loc.id)}>{loc.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      data-testid={`input-line${idx}-qty`}
                      className="input"
                      placeholder="如 100"
                      value={l.qty}
                      onChange={(e) => setLine(idx, { qty: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      data-testid={`input-line${idx}-batchNo`}
                      className="input"
                      value={l.batchNo}
                      onChange={(e) => setLine(idx, { batchNo: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      data-testid={`btn-remove-line-${idx}`}
                      className="text-red-600 hover:underline text-xs"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 1}
                    >删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
