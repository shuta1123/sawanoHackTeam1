// GET /api/wakelogs?userId=xxx&limit=14
//
// ダッシュボードの「起床履歴表示」用エンドポイント（README MVP機能一覧 / PCアプリ）。
// 新しい日付順に最大 limit 件返す。

import { NextRequest, NextResponse } from 'next/server';
import { listWakeLogs } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const limitParam = req.nextUrl.searchParams.get('limit');
  // limit未指定 or 数値変換失敗時は14件（約2週間分）をデフォルトにする
  const limit = limitParam && !Number.isNaN(Number(limitParam)) ? Number(limitParam) : 14;

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const logs = await listWakeLogs(userId, limit);
  return NextResponse.json({ logs });
}
