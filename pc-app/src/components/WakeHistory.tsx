// 「起床履歴表示」コンポーネント（README MVP機能一覧 / PCアプリ）。
// GET /api/wakelogs を呼び出して一覧表示する。
'use client';

import { useEffect, useState } from 'react';
import type { WakeLog } from '@/lib/types';
import styles from './WakeHistory.module.css';

interface WakeHistoryProps {
  userId: string;
  /** 値が変わるたびに再取得する。QR解除直後に最新の履歴を反映させるために使う */
  refreshKey: number;
}

export default function WakeHistory({ userId, refreshKey }: WakeHistoryProps) {
  const [logs, setLogs] = useState<WakeLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/wakelogs?userId=${encodeURIComponent(userId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data.logs)) throw new Error('レスポンス形式エラー');
        setLogs(data.logs);
      })
      .catch((e: Error) => {
        console.error('[WakeHistory] fetch error:', e);
        setError(e.message);
        setLogs([]);
      });
    // refreshKeyを依存配列に入れることで、親(Dashboard)から再取得を指示できるようにしている
  }, [userId, refreshKey]);

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>起床履歴</h2>

      {logs === null && <p className={styles.empty}>読み込み中…</p>}
      {error && <p className={styles.empty} style={{ color: 'red' }}>エラー: {error}</p>}
      {!error && logs?.length === 0 && <p className={styles.empty}>まだ記録がありません</p>}

      <ul className={styles.list}>
        {logs?.map((log) => (
          <li key={log.date} className={styles.item}>
            <span className={styles.date}>{log.date}</span>
            <span className={styles.time}>{log.wakeTime}</span>
            <span className={log.success ? styles.success : styles.fail}>
              {log.success ? '成功' : '失敗'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
