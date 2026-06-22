// Firestoreへのデータアクセスをまとめたモジュール（データアクセス層）。
// API Routes（src/app/api/**）はこのモジュールの関数だけを呼び、
// Firestoreのコレクション名やクエリの書き方を直接知らなくてよいようにする。
//
// Firebase 未設定時（isFirebaseReady === false）はモックデータを返すデバッグモードで動作する。

import { db, isFirebaseReady } from './firebaseAdmin';
import { Alarm, WakeLog } from './types';

const ALARMS_COLLECTION = 'alarms';
const WAKE_LOGS_COLLECTION = 'wakeLogs';

// ── デバッグ用インメモリストア ──────────────────────────────────────
// Firebase 未設定時のみ使用。プロセス再起動でリセットされる。
const _debugAlarmDefault: Alarm = {
  time: '07:00',
  repeatDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  status: 'scheduled',
  dismissedAt: null,
  updatedAt: new Date().toISOString(),
};
const debugAlarms: Map<string, Alarm> = new Map();

const debugWakeLogs: WakeLog[] = [
  { userId: 'user001', date: '2026-06-20', wakeTime: '06:58', success: true },
  { userId: 'user001', date: '2026-06-19', wakeTime: '07:03', success: true },
  { userId: 'user001', date: '2026-06-18', wakeTime: '07:11', success: false },
];

/**
 * alarms/{userId} を1件取得する。
 * MVPは1ユーザー1アラームのため、ドキュメントID = userId。
 */
export async function getAlarm(userId: string): Promise<Alarm | null> {
  if (!isFirebaseReady) {
    return debugAlarms.get(userId) ?? { ..._debugAlarmDefault };
  }
  const snap = await db!.collection(ALARMS_COLLECTION).doc(userId).get();
  if (!snap.exists) return null;
  return snap.data() as Alarm;
}

/**
 * QRコード読取成功時にPCが呼び出す解除処理。
 * README 設計決定 #4: 「dismissed」はPCがQR読取成功時に書く責務。
 *
 * merge: true にしているのは、time / repeatDays など他のフィールドを消さずに
 * status / dismissedAt / updatedAt だけを上書きするため。
 */
export async function dismissAlarm(userId: string): Promise<{ dismissedAt: string }> {
  const dismissedAtIso = new Date().toISOString();

  if (!isFirebaseReady) {
    const current = debugAlarms.get(userId) ?? { ..._debugAlarmDefault };
    debugAlarms.set(userId, {
      ...current,
      status: 'dismissed',
      dismissedAt: dismissedAtIso,
      updatedAt: dismissedAtIso,
    });
    return { dismissedAt: dismissedAtIso };
  }

  await db!.collection(ALARMS_COLLECTION).doc(userId).set(
    {
      status: 'dismissed',
      dismissedAt: dismissedAtIso,
      updatedAt: dismissedAtIso,
    },
    { merge: true }
  );

  return { dismissedAt: dismissedAtIso };
}

/**
 * 起床ログ(wakeLogs)を1件記録する。
 *
 * ドキュメントIDを `${userId}_${date}` にし、create() で原子的に作成する。
 * 同一 userId+date が既にある場合は既存を返す（1日1レコード保証）。
 * success は常に true で記録する（failed の場合は iPhone 側が書く）。
 */
export async function recordWakeLog(userId: string, wakeTimeIso: string): Promise<WakeLog> {
  const date = wakeTimeIso.slice(0, 10); // "YYYY-MM-DD"
  const wakeTime = wakeTimeIso.slice(11, 16); // "HH:mm"

  const log: WakeLog = {
    userId,
    date,
    wakeTime,
    success: true,
  };

  if (!isFirebaseReady) {
    const idx = debugWakeLogs.findIndex((l) => l.userId === userId && l.date === date);
    if (idx >= 0) {
      debugWakeLogs[idx] = log;
    } else {
      debugWakeLogs.unshift(log);
    }
    return log;
  }

  const ref = db!.collection(WAKE_LOGS_COLLECTION).doc(`${userId}_${date}`);
  try {
    // create() は既存ドキュメントがあると ALREADY_EXISTS で失敗するため、
    // 原子的に「1日1レコード」を保証できる（バックエンドと同じアプローチ）。
    await ref.create(log);
  } catch {
    // 同日のログが既に存在する場合は既存を返す
    const snap = await ref.get();
    if (snap.exists) return snap.data() as WakeLog;
    throw new Error(`wakeLogs への書き込みに失敗しました: userId=${userId}, date=${date}`);
  }
  return log;
}

/**
 * 起床履歴を新しい日付順に取得する（ダッシュボードの履歴表示用）。
 *
 * バックエンド（backend/src/wakeLogs.ts）と同じ where+orderBy クエリを使用。
 * firestore.indexes.json に複合インデックス（userId ASC, date DESC）が必要。
 */
export async function listWakeLogs(userId: string, limit = 14): Promise<WakeLog[]> {
  if (!isFirebaseReady) {
    return debugWakeLogs.filter((l) => l.userId === userId).slice(0, limit);
  }

  const snap = await db!
    .collection(WAKE_LOGS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data() as WakeLog);
}

/**
 * 連続起床成功日数（ストリーク）を計算する。
 * 直近から遡って success=true が続く日数を返す。
 *
 * @param logs listWakeLogs の戻り値（日付降順）
 * @param today 起点の日付 "YYYY-MM-DD"
 */
export function calcStreak(logs: WakeLog[], today: string): number {
  if (logs.length === 0) return 0;

  const byDate = new Map<string, WakeLog>();
  for (const log of logs) byDate.set(log.date, log);

  let streak = 0;
  const cursor = parseLocalDate(today);

  // 今日または昨日から始まらない場合は 0（今朝まだ起きていない場合を許容）
  if (!byDate.has(formatDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!byDate.has(formatDate(cursor))) return 0;
  }

  while (true) {
    const key = formatDate(cursor);
    const log = byDate.get(key);
    if (!log || !log.success) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
