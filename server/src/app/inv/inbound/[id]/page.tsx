'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const KIND_LABEL: Record<string, string> = {
  PURCHASE: '采购入库',
  RETURN: '退货入库',
  TRANSFER: '调拨入库',
  STOCKTAKE: '盘盈入库',
  OTHER: '其他',
};

const STATUS_LABEL: Record<number, { text: string; cls: string }> = {
  10: { text: '草稿', cls: 'badge-info' },
  20: { text: '待审核', cls: 'badge-warning' },
  30: { text: '已审核', cls: 'badge-success' },
  40: { text: '已完成', cls: 'badge-success' },
  90: { text: '已作废', cls: 'badge-danger' },
};

export default function InboundDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // Keep id as a string: react-query hashes the queryKey via JSON.stringify,
  // which throws on bigint. The BigIntId zod schema accepts string and
  // transforms to bigint server-side.
  const id = params.id;
  const detail = trpc.inbound.detail.useQuery({ id });
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSuccess = (text: string) => () => {
    setErr(null);
    setMsg(text);
    utils.inbound.detail.invalidate({ id });
    utils.inbound.list.invalidate();
  };
  const onError = (e: { message: string }) => { setMsg(null); setErr(e.message); };

  const submit = trpc.inbound.submit.useMutation({ onSuccess: onSuccess('已提交审核'), onError });
  const audit = trpc.inbound.audit.useMutation({ onSuccess: onSuccess('审核通过'), onError });
  const finish = trpc.inbound.finish.useMutation({ onSuccess: onSuccess('已完成'), onError });
  const voidIt = trpc.inbound.void.useMutation({ onSuccess: onSuccess('已作废'), onError });

  if (detail.isLoading) return <AppShell><p>加载中…</p></AppShell>;
  if (detail.isError) return <AppShell><p className="text-red-600">{detail.error.message}</p></AppShell>;
  const d = detail.data!;
  const s = STATUS_LABEL[d.status] ?? { text: String(d.status), cls: 'badge-info' };

  // Legal next states (per operations.json):
  // 10 -> submit(20) | void(90)
  // 20 -> audit(30)  | void(90)
  // 30 -> finish(40) | (void via service red-rebound)
  // 40 -> nothing
  // 90 -> nothing
  const canSubmit = d.status === 10;
  const canAudit = d.status === 20;
  const canFinish = d.status === 30;
  const canVoid = d.status === 10 || d.status === 20 || d.status === 30;

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">入库单 #{d.docNo}</h1>
        <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Item label="单号" value={d.docNo} />
          <Item label="类型" value={KIND_LABEL[d.kind] ?? d.kind} />
          <Item label="仓库ID" value={String(d.warehouseId)} />
          <Item label="操作员ID" value={String(d.operatorId)} />
          <Item label="业务时间" value={new Date(d.operationAt).toLocaleString()} />
          <Item label="来源单号" value={d.sourceDocNo ?? '-'} />
          <Item label="备注" value={d.remark ?? '-'} />
          <Item label="版本号" value={`v${d.version}`} />
        </div>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 mb-4">
        <div className="px-6 py-3 border-b border-gray-100 font-semibold">明细</div>
        <table data-testid="table-inbound-lines" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">商品ID</th>
              <th className="px-4 py-2">库位ID</th>
              <th className="px-4 py-2">批次号</th>
              <th className="px-4 py-2">数量</th>
              <th className="px-4 py-2">单价</th>
              <th className="px-4 py-2">到期日</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={String(l.id)} data-testid={`row-line-${l.id}`} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono">{String(l.goodsId)}</td>
                <td className="px-4 py-2 font-mono">{String(l.locationId)}</td>
                <td className="px-4 py-2 font-mono">{l.batchNo}</td>
                <td className="px-4 py-2">{l.qty}</td>
                <td className="px-4 py-2">{l.unitPrice ?? '-'}</td>
                <td className="px-4 py-2">{l.expireAt ? new Date(l.expireAt).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
            {d.lines.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">无明细</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <p data-testid="success-msg" role="status" className="text-green-600 text-sm mb-2">{msg}</p>}
      {err && <p data-testid="error-msg" className="text-red-600 text-sm mb-2">{err}</p>}

      <div className="flex gap-3">
        <button
          data-testid="btn-submit"
          className="btn btn-primary"
          disabled={!canSubmit || submit.isPending}
          onClick={() => { if (confirm('确定提交此入库单进入审核？')) submit.mutate({ id }); }}
        >提交</button>
        <button
          data-testid="btn-audit"
          className="btn btn-primary"
          disabled={!canAudit || audit.isPending}
          onClick={() => { if (confirm('确认审核通过？将写入库存。')) audit.mutate({ id }); }}
        >审核</button>
        <button
          data-testid="btn-confirm"
          className="btn btn-primary"
          disabled={!canAudit || audit.isPending}
          onClick={() => { if (confirm('确认审核通过？将写入库存。')) audit.mutate({ id }); }}
        >确认</button>
        <button
          data-testid="btn-finish"
          className="btn btn-primary"
          disabled={!canFinish || finish.isPending}
          onClick={() => { if (confirm('确定完成此入库单？')) finish.mutate({ id }); }}
        >完成</button>
        <button
          data-testid="btn-void"
          className="btn btn-danger"
          disabled={!canVoid || voidIt.isPending}
          onClick={() => { if (confirm('确定作废此入库单？已审核单将红冲库存。')) voidIt.mutate({ id }); }}
        >作废</button>
        <button data-testid="btn-back" className="btn btn-secondary" onClick={() => router.push('/inv/inbound')}>返回列表</button>
      </div>
    </AppShell>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}
