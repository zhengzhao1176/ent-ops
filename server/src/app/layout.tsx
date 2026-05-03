import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@components/Providers';

export const metadata: Metadata = {
  title: '企业基础运营管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
