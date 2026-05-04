'use client';
export const runtime = 'edge';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // Keep id as a string: react-query hashes the queryKey via JSON.stringify,
  // which throws on bigint. The BigIntId zod schema accepts string and
  // transforms to bigint server-side.
  const id = params.id;
  const detail = trpc.user.detail.useQuery({ id });
  const update = trpc.user.update.useMutation();
  const [form, setForm] = useState({ realName: '', mobile: '', email: '', nickname: '' });
  const [version, setVersion] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (detail.data) {
      setForm({
        realName: detail.data.realName ?? '',
        mobile: detail.data.mobile ?? '',
        email: detail.data.email ?? '',
        nickname: detail.data.nickname ?? '',
      });
      setVersion(detail.data.version);
    }
  }, [detail.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await update.mutateAsync({ id, version, ...form });
      setMsg('保存成功');
      setTimeout(() => router.push('/admin/users'), 500);
    } catch (e) { setMsg((e as Error).message); }
  }

  if (detail.isLoading) return <AppShell><p>加载中…</p></AppShell>;
  if (detail.isError) return <AppShell><p className="text-red-600">{detail.error.message}</p></AppShell>;

  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">编辑用户 #{params.id}</h1>
      <form onSubmit={onSubmit} className="bg-white rounded shadow border border-gray-100 p-6 max-w-xl space-y-4">
        <div><label className="label">姓名</label><input data-testid="input-realName" className="input" value={form.realName} onChange={(e) => setForm({ ...form, realName: e.target.value })} /></div>
        <div><label className="label">手机号</label><input data-testid="input-mobile" className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
        <div><label className="label">邮箱</label><input data-testid="input-email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">昵称</label><input data-testid="input-nickname" className="input" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></div>
        {msg && <p data-testid="status-msg" role="status" className="text-sm text-green-600">{msg}</p>}
        <div className="flex gap-3 pt-2">
          <button data-testid="btn-submit" className="btn btn-primary" disabled={update.isPending}>保存</button>
          <button data-testid="btn-cancel" type="button" className="btn btn-secondary" onClick={() => router.back()}>取消</button>
        </div>
      </form>
    </AppShell>
  );
}
