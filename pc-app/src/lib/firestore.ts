// Firestoreへのデータアクセスをまとめたモジュール（データアクセス層）。
// API Routes（src/app/api/**）はこのモジュールの関数だけを呼び、
// Firestoreのコレクション名やクエリの書き方を直接知らなくてよいようにする。
//
// 複数アラーム対応: alarms/{userId}/items/{alarmId} サブコレクション構造
// Firebase 未設定時（isFirebaseReady === false）はモックデータを返すデバッグモードで動作する。

import { db, isFirebaseReady } from './firebaseAdmin';
import { Alarm, WakeLog } from './types';

const ALARMS_COLLECTION = 'alarms';
const WAKE_LOGS_COLLECTION = 'wakeLogs';

// ── デバッグ用インメモリストア ──────────────────────────────────────
const _debugAlarmDefault: Alarm = {
  id: 'debug-alarm-1',
  time: '07:00',
  repeatDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  status: 'scheduled',
  dismissedAt: null,
  updatedAt: new Date().toISOString(),
};
// userId -> alarms[]
const debugAlarms: Map<string, Alarm[]> = new Map();

const debugWakeLogs: WakeLog[] = [
  { userId: 'user001', date: '2026-06-20', wakeTime: '06:58', success: true },
  { userId: 'user001', date: '2026-06-19', wakeTime: '07:03', success: true },
  { userId: 'user001', date: '2026-06-18', wakeTime: '07:11', success: false },
];

/** 曜日コード配列（Date.getDay() の返り値 0=日曜 に対応）*/
const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** 鳴動とみなす時間窓（分） */
const RING_WINDOW_MINUTES = 10;

/** 現在時刻にアラームが鳴動中かどうかを判定する */
function isRinging(alarm: Alarm): boolean {
  if (alarm.status !== 'scheduled') return false;
  const now = new Date();
  if (alarm.repeatDays.length > 0) {
    const todayCode = WEEKDAY_CODES[now.getDay()];
    if (!alarm.repeatDays.includes(todayCode)) return false;
  }
  const [hour, minute] = alarm.time.split(':').map(Number);
  const alarmTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  const diffMins = (now.getTime() - alarmTime.getTime()) / 60_000;
  return diffMins >= 0 && diffMins < RING_WINDOW_MINUTES;
}

/**
 * alarms/{userId}/items サブコレクションから全アラームを取得し、
 * 現在鳴動中のものを返す。なければ先頭のアラームを返す（後方互換）。
 */
export async function getAlarm(userId: string): Promise<Alarm | null> {
  const alarms = await getAlarms(userId);
  if (alarms.length === 0) return null;
  return alarms.find(isRinging) ?? alarms[0];
}

/**
 * alarms/{userId}/items サブコレクションから全アラームを取得する。
 */
export async function getAlarms(userId: string): Promise<Alarm[]> {
  if (!isFirebaseReady) {
    return debugAlarms.get(userId) ?? [{ ..._debugAlarmDefault }];
  }

  const snap = await db!
    .collection(ALARMS_COLLECTION)
    .doc(userId)
    .collection('items')
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Alarm, 'id'>),
  }));
}

/**
 * QRコード読取成功時にPCが呼び出す解除処理。
 * alarmId が指定された場合はそのアラームを、未指定なら鳴動中のアラームを解除する。
 */
export async function dismissAlarm(
  userId: string,
  alarmId?: string
): Promise<{ dismissedAt: string; alarmId: string | undefined }> {
  const dismissedAtIso = new Date().toISOString();

  if (!isFirebaseReady) {
    const alarms = debugAlarms.get(userId) ?? [{ ..._debugAlarmDefault }];
    const target = alarmId
      ? alarms.find((a) => a.id === alarmId)
      : (alarms.find(isRinging) ?? alarms[0]);
    if (target) {
      target.status = 'dismissed';
      target.dismissedAt = dismissedAtIso;
      target.updatedAt = dismissedAtIso;
    }
    return { dismissedAt: dismissedAtIso, alarmId: target?.id };
  }

  // alarmId が未指定の場合は鳴動中アラームを探す
  let targetId = alarmId;
  if (!targetId) {
    const alarms = await getAlarms(userId);
    targetId = alarms.find(isRinging)?.id ?? alarms[0]?.id;
  }

  if (!targetId) {
    return { dismissedAt: dismissedAtIso, alarmId: undefined };
  }

  // iOS SDK は Firestore Timestamp しかデコードできないため
  // Admin SDK が Date → Timestamp 変換するよう Date オブジェクトで書く
  const now = new Date();
  await db!
    .collection(ALARMS_COLLECTION)
    .doc(userId)
    .collection('items')
    .doc(targetId)
    .set(
      {
        status: 'dismissed',
        dismissedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

  return { dismissedAt: dismissedAtIso, alarmId: targetId };
}

/**
 * 起床ログ(wakeLogs)を1件記録する。
 * 同一 userId+date が既にある場合は既存を返す（1日1レコード保証）。
 */
export async function recordWakeLog(userId: string, wakeTimeIso: string): Promise<WakeLog> {
  // Intl.DateTimeFormat で Asia/Tokyo に固定して date / wakeTime を算出する
  const d = new Date(wakeTimeIso);
  const fmt = (part: Intl.DateTimeFormatPartTypes) =>
    new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', [part]: '2-digit' })
      .format(d)
      .padStart(2, '0');
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const wakeTime = `${get('hour')}:${get('minute')}`;

  const log: WakeLog = { userId, date, wakeTime, success: true };

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
    await ref.create(log);
  } catch {
    const snap = await ref.get();
    if (snap.exists) return snap.data() as WakeLog;
    throw new Error(`wakeLogs への書き込みに失敗しました: userId=${userId}, date=${date}`);
  }
  return log;
}

/**
 * 起床履歴を新しい日付順に取得する。
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
 */
export function calcStreak(logs: WakeLog[], today: string): number {
  if (logs.length === 0) return 0;

  const byDate = new Map<string, WakeLog>();
  for (const log of logs) byDate.set(log.date, log);

  let streak = 0;
  const cursor = parseLocalDate(today);

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
