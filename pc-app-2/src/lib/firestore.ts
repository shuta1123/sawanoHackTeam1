// Firestoreへのデータアクセスをまとめたモジュール（データアクセス層）。
// API Routes（src/app/api/**）はこのモジュールの関数だけを呼び、
// Firestoreのコレクション名やクエリの書き方を直接知らなくてよいようにする。
//
// バックエンド共通層 #5 との整合のため以下を修正済み:
//  1. getNowJST() ヘルパー追加 ── toISOString() UTC スライスによる日付・時刻 ズレ修正
//  2. dismissAlarm ── runTransaction + 状態遷移バリデーション
//  3. recordWakeLog ── ISO文字列スライスをやめ、呼び出し側(dismissAlarm)から
//                      JST整形済みの date / wakeTime を受け取る形に変更
//  4. listWakeLogs  ── documentId 前方一致ハックをやめ where + orderBy + limit に変更
//                      （複合インデックス wakeLogs: userId ASC, date DESC が必要）

import { db } from './firebaseAdmin';
import { Alarm, WakeLog } from './types';

const ALARMS_COLLECTION = 'alarms';
const WAKE_LOGS_COLLECTION = 'wakeLogs';

// ----------------------------------------------------------------
// カスタムエラー
// ----------------------------------------------------------------

/** alarms/{userId} ドキュメントが存在しない */
export class AlarmNotFoundError extends Error {
  constructor(userId: string) {
    super(`alarm not found: ${userId}`);
    this.name = 'AlarmNotFoundError';
  }
}

/**
 * 解除しようとしたが既に dismissed / failed 済みだった。
 * レース条件やリトライによる二重解除をトランザクション内で検出する用途。
 */
export class AlarmAlreadyHandledError extends Error {
  constructor(public readonly currentStatus: Alarm['status']) {
    super(`alarm already in state: ${currentStatus}`);
    this.name = 'AlarmAlreadyHandledError';
  }
}

// ----------------------------------------------------------------
// 内部ヘルパー
// ----------------------------------------------------------------

/**
 * 現在時刻を UTC ISO 文字列と JST の日付・時刻文字列の両方で返す。
 *
 * toISOString() はUTCを返すため、そのままスライスすると
 * 日本時間(UTC+9)では日付が1日・時刻が9時間ずれる。
 * UTCオフセットを加算した上でスライスすることで JST の値を得る。
 */
function getNowJST(): { isoUtc: string; date: string; time: string } {
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  return {
    isoUtc: now.toISOString(),                 // Firestore に保存するタイムスタンプ (UTC)
    date: jstDate.toISOString().slice(0, 10),  // "YYYY-MM-DD" (JST)
    time: jstDate.toISOString().slice(11, 16), // "HH:mm" (JST)
  };
}

// ----------------------------------------------------------------
// データアクセス関数
// ----------------------------------------------------------------

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
 *
 * runTransaction を使い「scheduled → dismissed」の状態遷移を原子的に保証する:
 *  - ドキュメントが存在しない場合は AlarmNotFoundError をスローする
 *  - 既に dismissed / failed の場合は AlarmAlreadyHandledError をスローする
 *
 * 戻り値の date / wakeTime は getNowJST() で算出した JST 値のため、
 * 呼び出し側で再変換は不要。
 */
export async function dismissAlarm(
  userId: string
): Promise<{ dismissedAt: string; date: string; wakeTime: string }> {
  const ref = db.collection(ALARMS_COLLECTION).doc(userId);
  const { isoUtc, date, time: wakeTime } = getNowJST();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AlarmNotFoundError(userId);

    const data = snap.data() as Alarm;
    if (data.status !== 'scheduled') {
      throw new AlarmAlreadyHandledError(data.status);
    }

    tx.update(ref, {
      status: 'dismissed',
      dismissedAt: isoUtc,
      updatedAt: isoUtc,
    });
  });

  return { dismissedAt: isoUtc, date, wakeTime };
}

/**
 * 起床ログ(wakeLogs)を1件記録する。
 *
 * 引数の date / wakeTime は呼び出し側(dismissAlarm の戻り値)から
 * JST 整形済みの値を受け取る。toISOString() スライスは行わない。
 *
 * ドキュメントIDを `${userId}_${date}` にすることで1日1件を保証し、
 * 同日の QR 二重読み取り時も上書きにとどめる。
 *
 * success は常に true で記録する
 * （failed の記録は iPhone 側の責務。README 設計決定 #4）。
 */
export async function recordWakeLog(
  userId: string,
  date: string,
  wakeTime: string
): Promise<WakeLog> {
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
 * 【複合インデックスが必要】
 *   Firebase コンソール または firestore.indexes.json で以下を作成してください:
 *   Collection: wakeLogs / Fields: userId Ascending, date Descending
 *
 * ※ 旧実装はドキュメントID前方一致ハック（複合インデックス回避）だったが、
 *   バックエンド共通層 #5 に合わせ where + orderBy + limit に変更。
 */
export async function listWakeLogs(userId: string, limit = 14): Promise<WakeLog[]> {
  const snap = await db
    .collection(WAKE_LOGS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((d) => d.data() as WakeLog);
}
