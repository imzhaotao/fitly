import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fitly · 买之前，先在你家 3D 试一下',
  description: '选一套设计模板，改成你家尺寸，拖家具试摆，下单前看清净空、挡门、挡插座这些坑，再发给家人投票。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f4f1ec',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
