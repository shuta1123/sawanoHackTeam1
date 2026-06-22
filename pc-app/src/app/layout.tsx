// App Router のルートレイアウト。全ページ共通の<html>/<body>とグローバルCSSを読み込む。
import './globals.css';

export const metadata = {
  title: '起床確認端末',
  description: 'QRコードを読み取るまでアラームを止められない、起床支援システムのPCアプリ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
