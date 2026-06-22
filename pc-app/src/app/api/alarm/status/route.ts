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

/** 鳴動とみなす時間窓（分）。この時間を過ぎた scheduled は ringing に遷移しない */
const RING_WINDOW_MINUTES = 10;

/** 曜日コード配列（Date.getDay() の返り値 0=日曜 に対応）*/
const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * DB上の status が "scheduled" のとき、現在時刻からアラームが鳴動中かどうかを導出する。
 *
 * backend/src/alarms.ts の shouldRing() と同等のロジック:
 *  1. repeatDays が設定されている場合は今日の曜日が含まれていなければ false
 *  2. 現在時刻がアラーム時刻から RING_WINDOW_MINUTES 分以内なら ringing
 */
function deriveStatus(
  dbStatus: Alarm['status'],
  time: string,
  repeatDays: string[]
): AlarmWithDerivedStatus['derivedStatus'] {
  if (dbStatus !== 'scheduled') {
    return dbStatus; // dismissed / failed はそのまま
  }

  const now = new Date();

  // repeatDays が設定されている場合は今日の曜日をチェック
  if (repeatDays.length > 0) {
    const todayCode = WEEKDAY_CODES[now.getDay()];
    if (!repeatDays.includes(todayCode)) return 'scheduled';
  }

  const [hour, minute] = time.split(':').map(Number);
  const alarmDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  const diffMs = now.getTime() - alarmDateTime.getTime();
  const diffMins = diffMs / 60_000;

  // アラーム時刻から RING_WINDOW_MINUTES 分以内なら ringing
  return diffMins >= 0 && diffMins < RING_WINDOW_MINUTES ? 'ringing' : 'scheduled';
}
