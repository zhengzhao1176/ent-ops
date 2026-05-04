'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const KIND_LABEL: Record<string, string> = {
  FULL: '全量盘点',
  SAMPLING: '抽样盘点',
  DYNAMIC: '动态盘点',
};

const STATUS_LABEL: Record<number, { text: string; cls: string }> = {
  10: { text: '草稿', cls: 'badge-info' },
  20: { text: '录入中', cls: 'badge-warning' },
  25: { text: '待审核', cls: 'badge-warning' },
  30: { text: '已过账', cls: 'badge-success' },
  40: { text: '已完成', cls: 'badge-success' },
  90: { text: '已作废', cls: 'badge-danger' },
};

type LineRow = {
  id: bigint;
  stocktakeId: bigint;
  goodsId: bigint;
  locationId: bigint;
  batchNo: string | null;
  bookQty: string;
  actualQty: string | null;
  difference: string | null;
  reason: string | null;
};

export default function StocktakeDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // Keep id as a string: react-query hashes the queryKey via JSON.stringify,
  // which throws on bigint. The BigIntId zod schema accepts string and
  // transforms to bigint server-side.
  const id = params.id;
  const detail = trpc.stocktake.detail.useQuery({ id });
  const utils = trpc.useUtils();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSuccess = (text: string) => () => {
    setErr(null);
    setMsg(text);
    utils.stocktake.detail.invalidate({ id });
    utils.stocktake.list.invalidate();
  };
  const onError = (e: { message: string }) => { setMsg(null); setErr(e.message); };

  const freeze = trpc.stocktake.freeze.useMutation({ onSuccess: onSuccess('已冻结，明细已生成'), onError });
  const submit = trpc.stocktake.submit.useMutation({ onSuccess: onSuccess('已提交审核'), onError });
  const commit = trpc.stocktake.commit.useMutation({ onSuccess: onSuccess('已过账'), onError });
  const finish = trpc.stocktake.finish.useMutation({ onSuccess: onSuccess('已完成'), onError });
  const cancel = trpc.stocktake.cancel.useMutation({ onSuccess: onSuccess('已作废'), onError });
  const updateLineActual = trpc.stocktake.updateLineActual.useMutation({
    onSuccess: () => {
      setErr(null);
      setMsg('明细已保存');
      utils.stocktake.detail.invalidate({ id });
    },
    onError,
  });

  // Local edit state for each line: keyed by line id (as string).
  const [edit, setEdit] = useState<Record<string, { actualQty: string; reason: string }>>({});

  // Hydrate the edit state from server data when it changes (status=20 path).
  useEffect(() => {
    if (!detail.data) return;
    setEdit((prev) => {
      const next = { ...prev };
      for (const l of detail.data!.lines) {
        const k = String(l.id);
        if (!(k in next)) {
          next[k] = {
            actualQty: l.actualQty ?? '',
            reason: l.reason ?? '',
          };
        }
      }
      return next;
    });
  }, [detail.data]);

  if (detail.isLoading) return <AppShell><p>加载中…</p></AppShell>;
  if (detail.isError) return <AppShell><p className="text-red-600">{detail.error.message}</p></AppShell>;
  const d = detail.data!;
  const s = STATUS_LABEL[d.status] ?? { text: String(d.status), cls: 'badge-info' };

  // Legal next states (per operations.json):
  // 10 -> freeze(20) | cancel(90)
  // 20 -> submit(25) | cancel(90)
  // 25 -> commit(30)
  // 30 -> finish(40)
  // 40 -> nothing
  // 90 -> nothing
  const canFreeze = d.status === 10;
  const canSubmit = d.status === 20;
  const canCommit = d.status === 25;
  const canFinish = d.status === 30;
  const canCancel = d.status === 10 || d.status === 20;

  // Lines are editable only in status=20 (frozen, awaiting actual count entry).
  const linesEditable = d.status === 20;
  // Show actual/difference columns once we are at or past 25 (or in 20 — we want
  // to show what the user is entering live too).
  const showActual = d.status >= 20;
  // Show post-commit summary docs when status >= 30.
  const showPostingDocs = d.status >= 30;

  function lineState(l: LineRow) {
    const k = String(l.id);
    return edit[k] ?? { actualQty: l.actualQty ?? '', reason: l.reason ?? '' };
  }
  function setLineField(lineId: bigint, patch: Partial<{ actualQty: string; reason: string }>) {
    const k = String(lineId);
    setEdit((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? { actualQty: '', reason: '' }), ...patch },
    }));
  }
  function saveLine(l: LineRow) {
    const st = lineState(l);
    if (!/^-?\d+(\.\d{1,4})?$/.test(st.actualQty)) {
      setErr('实盘数需为 ≤4 位小数'); setMsg(null); return;
    }
    updateLineActual.mutate({
      id: String(l.id),
      actualQty: st.actualQty,
      reason: st.reason || undefined,
    });
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">盘点单 #{d.docNo}</h1>
        <span data-testid="badge-status" className={`badge ${s.cls}`}>{s.text}</span>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Item label="单号" value={d.docNo} />
          <Item label="类型" value={KIND_LABEL[d.kind] ?? d.kind} />
          <Item label="仓库ID" value={String(d.warehouseId)} />
          <Item label="操作员ID" value={String(d.operatorId)} />
          <Item label="业务时间" value={new Date(d.operationAt).toLocaleString()} />
          <Item label="原因" value={d.reason ?? '-'} />
          <Item label="备注" value={d.remark ?? '-'} />
          <Item label="版本号" value={`v${d.version}`} />
          {showPostingDocs && <Item label="盘盈单号" value={d.gainDocNo ?? '-'} />}
          {showPostingDocs && <Item label="盘亏单号" value={d.lossDocNo ?? '-'} />}
        </div>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 mb-4">
        <div className="px-6 py-3 border-b border-gray-100 font-semibold">明细</div>
        <table data-testid="table-stocktake-lines" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">商品ID</th>
              <th className="px-4 py-2">库位ID</th>
              <th className="px-4 py-2">批次号</th>
              <th className="px-4 py-2">账面数</th>
              {showActual && <th className="px-4 py-2">实盘数</th>}
              {showActual && <th className="px-4 py-2">差异</th>}
              {showActual && <th className="px-4 py-2">原因</th>}
              {linesEditable && <th className="px-4 py-2 text-right">操作</th>}
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => {
              const st = lineState(l);
              return (
                <tr key={String(l.id)} data-testid={`row-stocktake-line-${l.id}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono">{String(l.goodsId)}</td>
                  <td className="px-4 py-2 font-mono">{String(l.locationId)}</td>
                  <td className="px-4 py-2 font-mono">{l.batchNo ?? '-'}</td>
                  <td className="px-4 py-2">{l.bookQty}</td>
                  {showActual && (
                    <td className="px-4 py-2">
                      {linesEditable ? (
                        <input
                          data-testid={`input-line-${l.id}-actualQty`}
                          className="input"
                          placeholder="如 100"
                          value={st.actualQty}
                          onChange={(e) => setLineField(l.id, { actualQty: e.target.value })}
                        />
                      ) : (
                        l.actualQty ?? '-'
                      )}
                    </td>
                  )}
                  {showActual && (
                    <td className="px-4 py-2">{l.difference ?? '-'}</td>
                  )}
                  {showActual && (
                    <td className="px-4 py-2">
                      {linesEditable ? (
                        <input
                          data-testid={`input-line-${l.id}-reason`}
                          className="input"
                          placeholder="差异原因"
                          value={st.reason}
                          onChange={(e) => setLineField(l.id, { reason: e.target.value })}
                        />
                      ) : (
                        l.reason ?? '-'
                      )}
                    </td>
                  )}
                  {linesEditable && (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        data-testid={`btn-line-${l.id}-save`}
                        className="btn btn-secondary text-xs"
                        disabled={updateLineActual.isPending}
                        onClick={() => saveLine(l)}
                      >保存</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {d.lines.length === 0 && (
              <tr>
                <td colSpan={showActual ? (linesEditable ? 8 : 7) : 4} className="px-4 py-8 text-center text-gray-500">
                  {d.status === 10 ? '草稿状态，请先点击 "冻结" 生成明细' : '无明细'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && <p data-testid="success-msg" role="status" className="text-green-600 text-sm mb-2">{msg}</p>}
      {err && <p data-testid="error-msg" className="text-red-600 text-sm mb-2">{err}</p>}

      <div className="flex gap-3 flex-wrap">
        <button
          data-testid="btn-freeze"
          className="btn btn-primary"
          disabled={!canFreeze || freeze.isPending}
          onClick={() => { if (confirm('确定冻结此盘点单？将根据当前库存生成明细快照。')) freeze.mutate({ id }); }}
        >冻结</button>
        <button
          data-testid="btn-submit"
          className="btn btn-primary"
          disabled={!canSubmit || submit.isPending}
          onClick={() => { if (confirm('确定提交此盘点单进入审核？')) submit.mutate({ id }); }}
        >提交</button>
        <button
          data-testid="btn-commit"
          className="btn btn-primary"
          disabled={!canCommit || commit.isPending}
          onClick={() => { if (confirm('确认过账？将生成盘盈/盘亏单。')) commit.mutate({ id }); }}
        >过账</button>
        <button
          data-testid="btn-confirm"
          className="btn btn-primary"
          disabled={!canCommit || commit.isPending}
          onClick={() => { if (confirm('确认过账？将生成盘盈/盘亏单。')) commit.mutate({ id }); }}
        >确认</button>
        <button
          data-testid="btn-finish"
          className="btn btn-primary"
          disabled={!canFinish || finish.isPending}
          onClick={() => { if (confirm('确定完成此盘点单？')) finish.mutate({ id }); }}
        >完成</button>
        <button
          data-testid="btn-cancel"
          className="btn btn-danger"
          disabled={!canCancel || cancel.isPending}
          onClick={() => { if (confirm('确定作废此盘点单？')) cancel.mutate({ id }); }}
        >作废</button>
        <button data-testid="btn-back" className="btn btn-secondary" onClick={() => router.push('/inv/stocktake')}>返回列表</button>
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
