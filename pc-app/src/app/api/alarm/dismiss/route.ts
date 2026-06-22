// POST /api/alarm/dismiss
// body: { "userId": "user001" }
//
// PCがQRコードの読み取りに成功した直後に呼び出すエンドポイント。
// 1. alarms/{userId} の status を "dismissed" に更新（README 設計決定 #4）
// 2. wakeLogs に当日分の起床記録を1件追加する

import { NextRequest, NextResponse } from 'next/server';
import { getAlarm, dismissAlarm, recordWakeLog } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // JSONパース失敗時もここで吸収し、後段で400を返す
  const body = await req.json().catch(() => null);
  const userId = body?.userId;

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const alarm = await getAlarm(userId);
  if (!alarm) {
    return NextResponse.json({ error: 'alarm not found for this userId' }, { status: 404 });
  }

  // 二重解除の防止: すでに dismissed / failed になっている場合は
  // 二重にwakeLogsを書き込まないよう、現状をそのまま返して終了する。
  // （QRスキャナーが何らかの理由で同じ読み取りを2回送ってしまった場合の保険）
  if (alarm.status === 'dismissed' || alarm.status === 'failed') {
    return NextResponse.json({ ok: true, alreadyHandled: true, status: alarm.status });
  }

  const { dismissedAt } = await dismissAlarm(userId);
  const wakeLog = await recordWakeLog(userId, dismissedAt);

  return NextResponse.json({ ok: true, dismissedAt, wakeLog });
}
