// POST /api/alarm/dismiss
// body: { "userId": "...", "alarmId": "..." (optional) }
//
// PCがQRコードの読み取りに成功した直後に呼び出すエンドポイント。
// 1. alarms/{userId}/items/{alarmId} の status を "dismissed" に更新
// 2. wakeLogs に当日分の起床記録を1件追加する

import { NextRequest, NextResponse } from 'next/server';
import { getAlarm, dismissAlarm, recordWakeLog } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  const alarmId: string | undefined = body?.alarmId;

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const alarm = await getAlarm(userId);
  if (!alarm) {
    return NextResponse.json({ error: 'alarm not found for this userId' }, { status: 404 });
  }

  // 二重解除の防止
  if (alarm.status === 'dismissed' || alarm.status === 'failed') {
    return NextResponse.json({ ok: true, alreadyHandled: true, status: alarm.status });
  }

  const { dismissedAt, alarmId: dismissedAlarmId } = await dismissAlarm(userId, alarmId ?? alarm.id);
  const wakeLog = await recordWakeLog(userId, dismissedAt);

  return NextResponse.json({ ok: true, dismissedAt, alarmId: dismissedAlarmId, wakeLog });
}
