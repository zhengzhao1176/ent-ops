'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.error === 'FORBIDDEN' && /LOCKED/.test(data.message)) setError('账号已锁定，请稍后再试');
        else if (data.error === 'FORBIDDEN' && /DISABLED/.test(data.message)) setError('账号已禁用');
        else if (data.error === 'FORBIDDEN' && /PENDING/.test(data.message)) setError('账号未激活');
        else setError(r.status === 401 ? '账号或密码错误' : data.message ?? '登录失败');
        return;
      }
      if (data.user.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-8 rounded shadow">
        <h1 className="text-xl font-semibold mb-6">登录</h1>
        <div className="mb-4">
          <label className="label">账号（工号 / 手机号 / 邮箱）</label>
          <input
            data-testid="input-loginId"
            className="input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="mb-6">
          <label className="label">密码</label>
          <input
            data-testid="input-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p data-testid="login-error" className="text-sm text-red-600 mb-4">{error}</p>}
        <button data-testid="btn-login" type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? '登录中…' : '登录'}
        </button>
      </form>
    </main>
  );
}
