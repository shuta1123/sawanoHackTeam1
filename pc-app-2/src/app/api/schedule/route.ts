// GET /api/schedule?userId=xxx
//
// 「今日の予定表示」用エンドポイント（README 設計決定 #5: MVPはハードコードでよい）。
// 中身は src/lib/schedule.ts にあるので、将来カレンダー連携する際はそちらだけ差し替える。

import { NextRequest, NextResponse } from 'next/server';
import { getTodaySchedule } from '@/lib/schedule';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  return NextResponse.json({ schedule: getTodaySchedule(userId) });
}
