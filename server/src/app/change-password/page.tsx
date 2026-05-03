'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@lib/trpc';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const change = trpc.auth.changePassword.useMutation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    try {
      await change.mutateAsync({ oldPassword, newPassword, confirmPassword });
      setSuccess('修改成功');
      setTimeout(() => router.push('/'), 600);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-8 rounded shadow">
        <h1 className="text-xl font-semibold mb-6">修改密码</h1>
        <div className="mb-4">
          <label className="label">原密码</label>
          <input data-testid="input-oldPassword" type="password" className="input" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="label">新密码（≥8 位含大小写+数字）</label>
          <input data-testid="input-newPassword" type="password" className="input" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        </div>
        <div className="mb-6">
          <label className="label">确认新密码</label>
          <input data-testid="input-confirmPassword" type="password" className="input" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p data-testid="error-msg" className="text-sm text-red-600 mb-4">{error}</p>}
        {success && <p data-testid="success-msg" role="status" className="text-sm text-green-600 mb-4">{success}</p>}
        <button data-testid="btn-submit" className="btn btn-primary w-full" disabled={change.isPending}>提交</button>
      </form>
    </main>
  );
}
