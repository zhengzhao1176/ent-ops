'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const KIND_LABEL: Record<string, string> = {
  INTERNAL: '内部调拨',
  RETURN: '退仓调拨',
  ADJUSTMENT: '调整调拨',
};

const STATUS_LABEL: Record<number, { text: string; cls: string }> = {
  10: { text: '草稿', cls: 'badge-info' },
  20: { text: '待审核', cls: 'badge-warning' },
  25: { text: '已发出', cls: 'badge-warning' },
  30: { text: '已收货', cls: 'badge-success' },
  40: { text: '已完成', cls: 'badge-success' },
  90: { text: '已作废', cls: 'badge-danger' },
};

export default function TransferDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // Keep id as a string: react-query hashes the queryKey via JSON.stringify,
  // which throws on bigint. The BigIntId zod schema accepts string and
  // transforms to bigint server-side.
  const id = params.id;
  const detail = trpc.transfer.detail.useQuery({ id });
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSuccess = (text: string) => () => {
    setErr(null);
    setMsg(text);
    utils.transfer.detail.invalidate({ id });
    utils.transfer.list.invalidate();
  };
  const onError = (e: { message: string }) => { setMsg(null); setErr(e.message); };

  const submit = trpc.transfer.submit.useMutation({ onSuccess: onSuccess('已提交审核'), onError });
  const audit = trpc.transfer.audit.useMutation({ onSuccess: onSuccess('审核通过'), onError });
  const receive = trpc.transfer.receive.useMutation({ onSuccess: onSuccess('已收货'), onError });
  const finish = trpc.transfer.finish.useMutation({ onSuccess: onSuccess('已完成'), onError });
  const voidIt = trpc.transfer.void.useMutation({ onSuccess: onSuccess('已作废'), onError });

  if (detail.isLoading) return <AppShell><p>加载中…</p></AppShell>;
  if (detail.isError) return <AppShell><p className="text-red-600">{detail.error.message}</p></AppShell>;
  const d = detail.data!;
  const s = STATUS_LABEL[d.status] ?? { text: String(d.status), cls: 'badge-info' };

  // Legal next states (per operations.json):
  // 10 -> submit(20)  | void(90)
  // 20 -> audit(25)   | void(90)
  // 25 -> receive(30)
  // 30 -> finish(40)
  // 40 -> nothing
  // 90 -> nothing
  const canSubmit = d.status === 10;
  const canAudit = d.status === 20;
  const canReceive = d.status === 25;
  const canFinish = d.status === 30;
  const canVoid = d.status === 10 || d.status === 20;

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">调拨单 #{d.docNo}</h1>
        <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Item label="单号" value={d.docNo} />
          <Item label="类型" value={KIND_LABEL[d.kind] ?? d.kind} />
          <Item label="操作员ID" value={String(d.operatorId)} />
          <Item label="源仓库ID" value={String(d.fromWarehouseId)} />
          <Item label="源库位ID" value={String(d.fromLocationId)} />
          <Item label="目标仓库ID" value={String(d.toWarehouseId)} />
          <Item label="目标库位ID" value={String(d.toLocationId)} />
          <Item label="申请人ID" value={d.applicantId !== null ? String(d.applicantId) : '-'} />
          <Item label="业务时间" value={new Date(d.operationAt).toLocaleString()} />
          <Item label="原因" value={d.reason ?? '-'} />
          <Item label="备注" value={d.remark ?? '-'} />
          <Item label="版本号" value={`v${d.version}`} />
        </div>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 mb-4">
        <div className="px-6 py-3 border-b border-gray-100 font-semibold">明细</div>
        <table data-testid="table-transfer-lines" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">商品ID</th>
              <th className="px-4 py-2">批次号</th>
              <th className="px-4 py-2">数量</th>
              <th className="px-4 py-2">已发出</th>
              <th className="px-4 py-2">已收货</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={String(l.id)} data-testid={`row-line-${l.id}`} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono">{String(l.goodsId)}</td>
                <td className="px-4 py-2 font-mono">{l.batchNo ?? '-'}</td>
                <td className="px-4 py-2">{l.qty}</td>
                <td className="px-4 py-2">{l.shippedQty ?? '-'}</td>
                <td className="px-4 py-2">{l.receivedQty ?? '-'}</td>
              </tr>
            ))}
            {d.lines.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">无明细</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <p data-testid="success-msg" role="status" className="text-green-600 text-sm mb-2">{msg}</p>}
      {err && <p data-testid="error-msg" className="text-red-600 text-sm mb-2">{err}</p>}

      <div className="flex gap-3 flex-wrap">
        <button
          data-testid="btn-submit"
          className="btn btn-primary"
          disabled={!canSubmit || submit.isPending}
          onClick={() => { if (confirm('确定提交此调拨单进入审核？')) submit.mutate({ id }); }}
        >提交</button>
        <button
          data-testid="btn-audit"
          className="btn btn-primary"
          disabled={!canAudit || audit.isPending}
          onClick={() => { if (confirm('确认审核通过？将锁定可用库存并准备发出。')) audit.mutate({ id }); }}
        >审核</button>
        <button
          data-testid="btn-confirm"
          className="btn btn-primary"
          disabled={!canAudit || audit.isPending}
          onClick={() => { if (confirm('确认审核通过？将锁定可用库存并准备发出。')) audit.mutate({ id }); }}
        >确认</button>
        <button
          data-testid="btn-receive"
          className="btn btn-primary"
          disabled={!canReceive || receive.isPending}
          onClick={() => { if (confirm('确定收货？将写入目标库存。')) receive.mutate({ id }); }}
        >收货</button>
        <button
          data-testid="btn-finish"
          className="btn btn-primary"
          disabled={!canFinish || finish.isPending}
          onClick={() => { if (confirm('确定完成此调拨单？')) finish.mutate({ id }); }}
        >完成</button>
        <button
          data-testid="btn-void"
          className="btn btn-danger"
          disabled={!canVoid || voidIt.isPending}
          onClick={() => { if (confirm('确定作废此调拨单？')) voidIt.mutate({ id }); }}
        >作废</button>
        <button data-testid="btn-back" className="btn btn-secondary" onClick={() => router.push('/inv/transfer')}>返回列表</button>
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
