'use client';

import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

const RESULT_LABEL: Record<string, { text: string; cls: string }> = {
  SUCCESS: { text: '成功', cls: 'badge-success' },
  FAILURE: { text: '失败', cls: 'badge-danger' },
};

// Common entities/actions are populated as suggestions; user can also free-type by switching to text
const ENTITY_OPTIONS = [
  '', 'user', 'role', 'permission', 'department', 'goods', 'category',
  'warehouse', 'location', 'inbound', 'outbound', 'transfer', 'stocktake',
];
const ACTION_OPTIONS = [
  '', 'login', 'logout', 'create', 'update', 'delete', 'restore',
  'audit', 'void', 'post', 'assign', 'reset', 'enable', 'disable',
];

function fmtDateTimeLocal(d: Date) {
  // yyyy-MM-ddThh:mm in local time, suitable for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AuditPage() {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [entity, setEntity] = useState<string>('');
  const [actionType, setActionType] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const list = trpc.audit.list.useQuery({
    page,
    pageSize: 20,
    keyword: keyword || undefined,
    entity: entity || undefined,
    actionType: actionType || undefined,
    result: (result || undefined) as 'SUCCESS' | 'FAILURE' | undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  function toggleRow(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  function setQuickRange(hours: number) {
    const now = new Date();
    const start = new Date(now.getTime() - hours * 3600_000);
    setFrom(fmtDateTimeLocal(start));
    setTo(fmtDateTimeLocal(now));
  }

  function clearFilters() {
    setFrom(''); setTo(''); setEntity(''); setActionType('');
    setResult(''); setKeyword(''); setPage(1);
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">审计日志</h1>
        <div className="text-xs text-gray-500">只读：审计日志不可修改或删除</div>
      </div>

      <div className="bg-white rounded shadow border border-gray-100 mb-4 p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="label">起始时间</label>
          <input
            data-testid="input-from"
            className="input"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label">结束时间</label>
          <input
            data-testid="input-to"
            className="input"
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="label">实体</label>
          <select
            data-testid="select-entity"
            className="input"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            {ENTITY_OPTIONS.map((v) => (
              <option key={v} value={v}>{v || '全部实体'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">操作类型</label>
          <select
            data-testid="select-actionType"
            className="input"
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
          >
            {ACTION_OPTIONS.map((v) => (
              <option key={v} value={v}>{v || '全部操作'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">结果</label>
          <select
            data-testid="select-result"
            className="input"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          >
            <option value="">全部结果</option>
            {Object.entries(RESULT_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l.text}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">关键字</label>
          <input
            data-testid="input-keyword"
            className="input"
            placeholder="搜索操作人/IP/消息"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="md:col-span-6 flex flex-wrap items-center gap-2 pt-1">
          <button
            data-testid="btn-search"
            className="btn btn-primary"
            onClick={() => { setPage(1); list.refetch(); }}
          >查询</button>
          <button
            data-testid="btn-reset-filters"
            className="btn btn-secondary"
            onClick={clearFilters}
          >重置</button>
          <span className="text-xs text-gray-500 ml-2">快捷:</span>
          <button data-testid="btn-range-1h" className="btn btn-secondary text-xs" onClick={() => setQuickRange(1)}>近1小时</button>
          <button data-testid="btn-range-24h" className="btn btn-secondary text-xs" onClick={() => setQuickRange(24)}>近24小时</button>
          <button data-testid="btn-range-7d" className="btn btn-secondary text-xs" onClick={() => setQuickRange(24 * 7)}>近7天</button>
        </div>
      </div>

      <div className="bg-white rounded shadow border border-gray-100">
        <table data-testid="table-audit" className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-2">时间</th>
              <th className="px-4 py-2">操作人</th>
              <th className="px-4 py-2">IP</th>
              <th className="px-4 py-2">实体</th>
              <th className="px-4 py-2">操作类型</th>
              <th className="px-4 py-2">结果</th>
              <th className="px-4 py-2">消息</th>
              <th className="px-4 py-2 text-right">详情</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((a) => {
              const id = String(a.id);
              const isOpen = expanded.has(id);
              const r = RESULT_LABEL[a.result] ?? { text: a.result, cls: 'badge-info' };
              return (
                <ReactFragmentRow
                  key={id}
                  id={id}
                  log={a}
                  isOpen={isOpen}
                  onToggle={() => toggleRow(id)}
                  resultBadge={r}
                />
              );
            })}
            {(list.data?.items ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{list.isLoading ? '加载中…' : '无数据'}</td></tr>
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

function ReactFragmentRow({
  id,
  log,
  isOpen,
  onToggle,
  resultBadge,
}: {
  id: string;
  log: {
    id: bigint | string;
    operatorId: bigint | string | null;
    operatorName: string | null;
    ip: string | null;
    actionType: string;
    entity: string;
    entityId: string | null;
    before: unknown;
    after: unknown;
    result: string;
    message: string | null;
    createdAt: Date | string;
  };
  isOpen: boolean;
  onToggle: () => void;
  resultBadge: { text: string; cls: string };
}) {
  return (
    <>
      <tr data-testid={`row-audit-${id}`} className="border-t border-gray-100">
        <td className="px-4 py-2">{new Date(log.createdAt).toLocaleString()}</td>
        <td className="px-4 py-2">
          {log.operatorName ?? '—'}
          {log.operatorId && (
            <span className="text-xs text-gray-500 font-mono ml-1">#{String(log.operatorId)}</span>
          )}
        </td>
        <td className="px-4 py-2 font-mono">{log.ip ?? '—'}</td>
        <td className="px-4 py-2">
          {log.entity}
          {log.entityId && (
            <span className="text-xs text-gray-500 font-mono ml-1">#{log.entityId}</span>
          )}
        </td>
        <td className="px-4 py-2">{log.actionType}</td>
        <td className="px-4 py-2">
          <span data-testid="badge-result" className={`badge ${resultBadge.cls}`}>{resultBadge.text}</span>
        </td>
        <td className="px-4 py-2 text-gray-700 max-w-xs truncate" title={log.message ?? ''}>
          {log.message ?? ''}
        </td>
        <td className="px-4 py-2 text-right">
          <button
            data-testid={`btn-toggle-detail-${id}`}
            className="text-brand-700 hover:underline text-xs"
            onClick={onToggle}
          >{isOpen ? '收起' : '展开'}</button>
        </td>
      </tr>
      {isOpen && (
        <tr data-testid={`detail-audit-${id}`} className="bg-gray-50">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">变更前 (before)</div>
                <pre data-testid={`pre-before-${id}`} className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-72">
{log.before === null || log.before === undefined ? '—' : JSON.stringify(log.before, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">变更后 (after)</div>
                <pre data-testid={`pre-after-${id}`} className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-72">
{log.after === null || log.after === undefined ? '—' : JSON.stringify(log.after, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
