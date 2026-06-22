// POST /api/alarm/dismiss
// body: { "userId": "user001" }
//
// PCがQRコードの読み取りに成功した直後に呼び出すエンドポイント。
// 1. alarms/{userId} の status を "dismissed" に更新（runTransaction で原子的に保証）
// 2. wakeLogs に当日分の起床記録を1件追加する
//
// 状態チェック・404チェックは dismissAlarm() 内のトランザクションで行うため、
// このルートでは getAlarm() を別途呼ばない（TOCTOU レース条件を防ぐ）。

import { NextRequest, NextResponse } from 'next/server';
import {
  dismissAlarm,
  recordWakeLog,
  AlarmNotFoundError,
  AlarmAlreadyHandledError,
} from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // JSONパース失敗時もここで吸収し、後段で400を返す
  const body = await req.json().catch(() => null);
  const userId = body?.userId;

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    // dismissAlarm はトランザクション内で状態遷移を検証し、
    // JST整形済みの date / wakeTime を返す。
    const { dismissedAt, date, wakeTime } = await dismissAlarm(userId);
    const wakeLog = await recordWakeLog(userId, date, wakeTime);
    return NextResponse.json({ ok: true, dismissedAt, wakeLog });
  } catch (err) {
    if (err instanceof AlarmNotFoundError) {
      return NextResponse.json({ error: 'alarm not found for this userId' }, { status: 404 });
    }
    // 二重解除: すでに dismissed / failed の場合はエラーにせず現状を返す
    // （QRスキャナーが同じ読み取りを2回送った場合の保険）
    if (err instanceof AlarmAlreadyHandledError) {
      return NextResponse.json({ ok: true, alreadyHandled: true, status: err.currentStatus });
    }
    throw err;
  }
}
