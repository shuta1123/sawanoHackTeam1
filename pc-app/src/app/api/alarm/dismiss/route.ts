// POST /api/alarm/dismiss
// body: { "userId": "...", "alarmId": "..." (optional) }
//
// PCがQRコードの読み取りに成功した直後に呼び出すエンドポイント。
// 1. alarms/{userId}/items/{alarmId} の status を "dismissed" に更新
// 2. wakeLogs に当日分の起床記録を1件追加する

import { NextRequest, NextResponse } from 'next/server';
import { getAlarm, dismissAlarm, recordWakeLog } from '@/lib/firestore';
import type { Alarm } from '@/lib/types';

const RING_WINDOW_MINUTES = 10;
const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function deriveAlarmStatus(
  dbStatus: Alarm['status'],
  time: string,
  repeatDays: string[]
): 'scheduled' | 'ringing' | 'dismissed' | 'failed' {
  if (dbStatus !== 'scheduled') return dbStatus;
  const now = new Date();
  if (repeatDays.length > 0 && !repeatDays.includes(WEEKDAY_CODES[now.getDay()])) return 'scheduled';
  const [hour, minute] = time.split(':').map(Number);
  const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  const diffMins = (now.getTime() - alarmTime.getTime()) / 60_000;
  return diffMins >= 0 && diffMins < RING_WINDOW_MINUTES ? 'ringing' : 'scheduled';
}

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

  // 鳴動中でないアラームは解除しない（scheduled なのに QR を読んでも無効）
  const derivedStatus = deriveAlarmStatus(alarm.status, alarm.time, alarm.repeatDays);
  if (derivedStatus !== 'ringing') {
    return NextResponse.json({ error: 'alarm is not ringing', derivedStatus }, { status: 409 });
  }

  // wakeLog を先に書いてから dismiss する。
  // iPhone の Firestore リスナーは dismissed 書き込みの瞬間に発火して
  // fetchWakeLogs を呼ぶため、dismiss より先に wakeLog を Firestore に入れておく必要がある。
  const dismissedAt = new Date().toISOString();
  const wakeLog = await recordWakeLog(userId, dismissedAt);
  const { alarmId: dismissedAlarmId } = await dismissAlarm(userId, alarmId ?? alarm.id);

  return NextResponse.json({ ok: true, dismissedAt, alarmId: dismissedAlarmId, wakeLog });
}
