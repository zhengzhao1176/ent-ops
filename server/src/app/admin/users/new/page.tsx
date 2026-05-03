'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@components/Layout';
import { trpc } from '@lib/trpc';

export default function NewUserPage() {
  const router = useRouter();
  const depts = trpc.department.tree.useQuery();
  const create = trpc.user.create.useMutation();
  const [form, setForm] = useState({
    employeeNo: '', username: '', realName: '', mobile: '', email: '', deptId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      await create.mutateAsync({
        employeeNo: form.employeeNo,
        username: form.username,
        realName: form.realName,
        mobile: form.mobile,
        email: form.email,
        deptId: BigInt(form.deptId),
      });
      setSuccess('创建成功');
      setTimeout(() => router.push('/admin/users'), 500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-semibold mb-4">新建用户</h1>
      <form onSubmit={onSubmit} className="bg-white rounded shadow border border-gray-100 p-6 max-w-xl space-y-4">
        <Field label="工号"><input data-testid="input-employeeNo" className="input" value={form.employeeNo} onChange={(e) => setForm({ ...form, employeeNo: e.target.value })} /></Field>
        <Field label="用户名"><input data-testid="input-username" className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label="姓名"><input data-testid="input-realName" className="input" value={form.realName} onChange={(e) => setForm({ ...form, realName: e.target.value })} /></Field>
        <Field label="手机号"><input data-testid="input-mobile" className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
        <Field label="邮箱"><input data-testid="input-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="部门">
          <select data-testid="select-deptId" className="input" value={form.deptId} onChange={(e) => setForm({ ...form, deptId: e.target.value })}>
            <option value="">请选择</option>
            {(depts.data ?? []).map((d) => <option key={String(d.id)} value={String(d.id)}>{d.name}</option>)}
          </select>
        </Field>
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
