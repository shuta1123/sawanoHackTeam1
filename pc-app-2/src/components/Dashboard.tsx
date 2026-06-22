// ダッシュボード本体（クライアントコンポーネント）。
// QRスキャナー、今日の予定、起床履歴、現在のアラーム状態バッジをまとめて配置する。
'use client';

import { useState, useCallback } from 'react';
import QRScanner from './QRScanner';
import ScheduleView from './ScheduleView';
import WakeHistory from './WakeHistory';
import AlarmStatusBadge from './AlarmStatusBadge';
import styles from './Dashboard.module.css';

export default function Dashboard({ userId }: { userId: string }) {
  // QR解除が成功するたびにインクリメントし、これをkeyとして子コンポーネントに渡すことで
  // 「起床履歴」を再取得させる（解除直後に最新の履歴がすぐ反映されるようにするため）。
  const [refreshKey, setRefreshKey] = useState(0);

  // useCallback で参照を安定させる。
  // インライン定義だと「解除成功 → setRefreshKey → 再レンダリング → onDismissed の参照変化 →
  // QRScanner の useEffect([expectedUserId, onDismissed]) 再実行 → startCamera() 起動 →
  // 「おはようございます！」画面がライブ映像に戻ってしまう」バグが発生する。
  const onDismissed = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WAKE &amp; MOVE</p>
          <h1 className={styles.title}>起床確認端末</h1>
        </div>
        <AlarmStatusBadge userId={userId} />
      </header>

      <div className={styles.grid}>
        <QRScanner
          expectedUserId={userId}
          onDismissed={onDismissed}
        />

        <div className={styles.side}>
          <ScheduleView userId={userId} />
          <WakeHistory userId={userId} refreshKey={refreshKey} />
        </div>
      </div>
    </main>
  );
}
