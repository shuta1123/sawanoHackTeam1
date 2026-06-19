// Firestoreへのデータアクセスをまとめたモジュール（データアクセス層）。
// API Routes（src/app/api/**）はこのモジュールの関数だけを呼び、
// Firestoreのコレクション名やクエリの書き方を直接知らなくてよいようにする。

import { db } from './firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import { Alarm, WakeLog } from './types';

const ALARMS_COLLECTION = 'alarms';
const WAKE_LOGS_COLLECTION = 'wakeLogs';

/**
 * alarms/{userId} を1件取得する。
 * MVPは1ユーザー1アラームのため、ドキュメントID = userId。
 */
export async function getAlarm(userId: string): Promise<Alarm | null> {
  const snap = await db.collection(ALARMS_COLLECTION).doc(userId).get();
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

  await db.collection(ALARMS_COLLECTION).doc(userId).set(
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
 * ドキュメントIDを `${userId}_${date}` にしているのは2つ理由がある:
 *  1) 同じ日に複数回QRを読み取っても上書きになり、重複レコードが増えない
 *  2) ドキュメントIDの前方一致で履歴一覧を取得できるため、
 *     Firestoreの複合インデックス作成が不要になる（listWakeLogs参照）
 *
 * success は常に true で記録する。
 * （タイムアウト・緊急停止による失敗 = failed は、README設計決定 #4 のとおり
 *   iPhone側がalarms.statusに書き込む責務であり、wakeLogsへの failed記録も
 *   iPhone側で行う想定。PC側の責務はQR成功時の記録のみ。チーム内で要確認）
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

  await db.collection(WAKE_LOGS_COLLECTION).doc(`${userId}_${date}`).set(log);
  return log;
}

/**
 * 起床履歴を新しい日付順に取得する（ダッシュボードの履歴表示用）。
 *
 * userId による絞り込みを「ドキュメントIDの前方一致」で行うことで、
 * where('userId','==',...).orderBy('date',...) のような複合インデックスを
 * 作らずに済むようにしている（ハッカソンの開発スピード優先のための工夫）。
 * 本格運用する場合は複合インデックスを作成し、通常のwhere+orderByに置き換えても良い。
 */
export async function listWakeLogs(userId: string, limit = 14): Promise<WakeLog[]> {
  const start = `${userId}_`;
  const end = `${userId}_\uf8ff`; // \uf8ff はUnicode上ほぼ最大の文字。前方一致検索の定番テクニック

  const snap = await db
    .collection(WAKE_LOGS_COLLECTION)
    .orderBy(FieldPath.documentId())
    .startAt(start)
    .endAt(end)
    .get();

  const logs = snap.docs.map((d) => d.data() as WakeLog);

  // ドキュメントID昇順 = 日付昇順（"YYYY-MM-DD"は文字列としても時系列順に並ぶ）なので、
  // 新しい順にしたいダッシュボード表示用に反転させてから件数を絞る。
  return logs.reverse().slice(0, limit);
}
