// GET /api/wakelogs?userId=xxx&limit=14
//
// ダッシュボードの「起床履歴表示」用エンドポイント（README MVP機能一覧 / PCアプリ）。
// 新しい日付順に最大 limit 件返す。

import { NextRequest, NextResponse } from 'next/server';
import { listWakeLogs } from '@/lib/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_LIMIT = 14; // 約2週間分
const MAX_LIMIT = 100;    // 上限キャップ

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const limitParam = req.nextUrl.searchParams.get('limit');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // 負値・ゼロ・非数値を弾き、1〜MAX_LIMIT の範囲にクランプする
  const rawLimit = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
  const limit = Number.isNaN(rawLimit)
    ? DEFAULT_LIMIT
    : Math.min(Math.max(1, Math.floor(rawLimit)), MAX_LIMIT);

  const logs = await listWakeLogs(userId, limit);
  return NextResponse.json({ logs });
}
