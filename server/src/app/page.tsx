'use client';

import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

export default function Dashboard() {
  const me = trpc.auth.me.useQuery();
  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">仪表板</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="当前用户" value={me.data?.realName ?? '-'} />
        <Card title="角色" value={(me.data?.roles ?? []).map((r) => r.name).join(' / ') || '-'} />
        <Card title="权限数" value={String((me.data?.permissions ?? []).length)} />
      </div>
    </AppShell>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded shadow border border-gray-100">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
