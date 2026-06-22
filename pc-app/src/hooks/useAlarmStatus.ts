// アラームの現在状態(/api/alarm/status)を一定間隔でポーリングするカスタムフック。
// ダッシュボードのヘッダーに「鳴動中」「解除済み」などのバッジを表示するために使う。
'use client';

import { useEffect, useState } from 'react';
import type { AlarmWithDerivedStatus } from '@/lib/types';

export function useAlarmStatus(userId: string, pollIntervalMs = 5000) {
  const [status, setStatus] = useState<AlarmWithDerivedStatus | null>(null);

  useEffect(() => {
    // クリーンアップ後のsetStateを防ぐためのフラグ
    let isActive = true;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/alarm/status?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return; // 404等は無視してそのまま次のポーリングを待つ
        const data: AlarmWithDerivedStatus = await res.json();
        if (isActive) setStatus(data);
      } catch {
        // PC起動直後でネットワークが不安定な場合などは無視し、ポーリングを継続する
      }
    }

    fetchStatus(); // 初回は即時取得
    const intervalId = setInterval(fetchStatus, pollIntervalMs);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [userId, pollIntervalMs]);

  return status;
}
