'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { trpc } from '@lib/trpc';

const NAV = [
  { href: '/', label: '仪表板' },
  { href: '/admin/users', label: '用户管理' },
  { href: '/admin/roles', label: '角色管理' },
  { href: '/admin/depts', label: '部门管理' },
  { href: '/admin/audit', label: '审计日志' },
  { href: '/inv/goods', label: '商品管理' },
  { href: '/inv/stock', label: '库存查询' },
  { href: '/inv/inbound', label: '入库管理' },
  { href: '/inv/outbound', label: '出库管理' },
  { href: '/inv/transfer', label: '调拨管理' },
  { href: '/inv/stocktake', label: '库存盘点' },
  { href: '/inv/reports', label: '报表分析' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const me = trpc.auth.me.useQuery(undefined, { retry: false });

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (me.isLoading) return <div className="p-8 text-gray-500">加载中…</div>;
  if (me.isError) {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-white border-r border-gray-200 p-4">
        <div className="font-semibold text-lg mb-6">企业运营</div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`nav-${n.href.replaceAll('/', '_')}`}
              className={`block px-3 py-2 rounded text-sm ${path === n.href ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-500">{path}</div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700" data-testid="me-name">{me.data?.realName}</span>
            <button data-testid="btn-logout" className="btn btn-secondary text-xs" onClick={logout}>退出</button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
