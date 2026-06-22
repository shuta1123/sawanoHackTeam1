// 「今日の予定表示」コンポーネント（README MVP機能一覧 / PCアプリ）。
// GET /api/schedule を呼び出して表示するだけのシンプルな実装。
'use client';

import { useEffect, useState } from 'react';
import type { ScheduleItem } from '@/lib/types';
import styles from './ScheduleView.module.css';

export default function ScheduleView({ userId }: { userId: string }) {
  // null = 読み込み中、空配列 = 予定なし、と区別するためnullableにしている
  const [items, setItems] = useState<ScheduleItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/schedule?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => setItems(data.schedule))
      .catch(() => setItems([]));
  }, [userId]);

  return (
    <section className={styles.card}>
      <h2 className={styles.heading}>今日の予定</h2>

      {items === null && <p className={styles.empty}>読み込み中…</p>}
      {items?.length === 0 && <p className={styles.empty}>今日の予定はありません</p>}

      <ul className={styles.list}>
        {items?.map((item) => (
          <li key={`${item.time}-${item.title}`} className={styles.item}>
            <span className={styles.time}>{item.time}</span>
            <span className={styles.title}>{item.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
