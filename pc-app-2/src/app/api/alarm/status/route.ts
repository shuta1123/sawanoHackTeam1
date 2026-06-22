// GET /api/alarm/status?userId=xxx
//
// 現在のアラーム状態を返す。
// README 設計決定 #4: 「ringing」はDBに保存せず、time(アラーム設定時刻)と現在時刻から導出する値。
// ここで導出ロジックを実装し、DBの実値(status)とは別に derivedStatus として返す。

import { NextRequest, NextResponse } from 'next/server';
import { getAlarm } from '@/lib/firestore';
import type { Alarm, AlarmWithDerivedStatus } from '@/lib/types';

// クエリパラメータを使うため常に動的に実行する（静的最適化・キャッシュをさせない）
export const dynamic = 'force-dynamic';
// firebase-admin はNode.js APIに依存するため、Edge Runtimeではなく通常のNode.jsランタイムを使う
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const alarm = await getAlarm(userId);
  if (!alarm) {
    return NextResponse.json({ error: 'alarm not found' }, { status: 404 });
  }

  const derivedStatus = deriveStatus(alarm.status, alarm.time, alarm.repeatDays);

  const body: AlarmWithDerivedStatus = { ...alarm, derivedStatus };
  return NextResponse.json(body);
}

/**
 * DB上のstatusが "scheduled" のとき、repeatDays と現在時刻から鳴動中(ringing)かを導出する。
 *
 * バックエンド共通層 #5 の shouldRing に合わせ、以下の2条件を満たす場合のみ "ringing":
 *  1. 今日が repeatDays に含まれる曜日である
 *  2. アラーム時刻を過ぎてから 10分以内である（10分窓）
 *
 * 10分を超えたら "scheduled" に戻す（長時間放置はフェイルセーフ側が処理する想定）。
 * repeatDays 未判定だった旧実装では「対象外曜日でも ringing」「時刻後に永遠に ringing」
 * の誤判定が起きていたが、この実装で両方解消される。
 */
function deriveStatus(
  dbStatus: Alarm['status'],
  time: string,
  repeatDays: string[]
): AlarmWithDerivedStatus['derivedStatus'] {
  if (dbStatus !== 'scheduled') return dbStatus; // dismissed / failed はそのまま

  const now = new Date();
  const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const todayKey = DAY_NAMES[now.getDay()];

  // 今日が繰り返し対象曜日でなければ scheduled のまま
  if (!repeatDays.includes(todayKey)) return 'scheduled';

  const [hour, minute] = time.split(':').map(Number);
  const alarmTime = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0
  );
  const diffMs = now.getTime() - alarmTime.getTime();
  const WINDOW_MS = 10 * 60 * 1000; // 10分窓

  return diffMs >= 0 && diffMs <= WINDOW_MS ? 'ringing' : 'scheduled';
}
