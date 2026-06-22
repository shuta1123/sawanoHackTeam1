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

  const derivedStatus = deriveStatus(alarm.status, alarm.time);

  const body: AlarmWithDerivedStatus = { ...alarm, derivedStatus };
  return NextResponse.json(body);
}

/**
 * DB上のstatusが "scheduled" のままで、かつ現在時刻がアラーム時刻を過ぎていれば
 * 「鳴動中(ringing)」とみなす（README 設計決定 #4 のロジックそのまま）。
 *
 * NOTE: 現状は repeatDays（今日が対象曜日かどうか）までは見ていない。
 * README本文の定義は時刻のみの比較なのでそれに合わせているが、
 * 「対象曜日でない日にscheduledのまま残っていたらringingと誤判定される」点は
 * チームで要確認（iPhone側が毎日 scheduled に再セットする前提に依存している）。
 */
function deriveStatus(dbStatus: Alarm['status'], time: string): AlarmWithDerivedStatus['derivedStatus'] {
  if (dbStatus !== 'scheduled') {
    return dbStatus; // dismissed / failed はそのまま
  }

  const [hour, minute] = time.split(':').map(Number);
  const now = new Date();
  const alarmDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);

  return now.getTime() >= alarmDateTime.getTime() ? 'ringing' : 'scheduled';
}
