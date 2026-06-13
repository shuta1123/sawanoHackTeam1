// wakeLogs コレクションのデータアクセス層
// 起床履歴の記録・取得・ストリーク（連続成功日数）計算

import { getDb } from "./firebase.js";
import { type WakeLog, isValidDate, isValidTime } from "./types.js";

const COLLECTION = "wakeLogs";

/** ドキュメントIDを userId+date で決め打ちし、1日1レコードを原子的に保証する */
function docId(userId: string, date: string): string {
  return `${userId}_${date}`;
}

/**
 * 起床ログを記録する。
 * ドキュメントID = `${userId}_${date}` に固定し、create() で原子的に作成する。
 * 同一 userId+date が既にある場合は重複作成せず既存を返す（1日1レコード）。
 */
export async function recordWakeLog(log: WakeLog): Promise<WakeLog> {
  if (!isValidDate(log.date)) {
    throw new Error(`不正な日付形式です: ${log.date}（"YYYY-MM-DD"）`);
  }
  if (!isValidTime(log.wakeTime)) {
    throw new Error(`不正な時刻形式です: ${log.wakeTime}（"HH:mm"）`);
  }

  const ref = getDb().collection(COLLECTION).doc(docId(log.userId, log.date));
  try {
    // create() は既存ドキュメントがあると ALREADY_EXISTS で失敗するため、
    // 「存在確認→追加」のような競合の余地がなく原子的に1件を保証できる
    await ref.create(log);
    return log;
  } catch (err) {
    const snap = await ref.get();
    if (snap.exists) {
      return snap.data() as WakeLog; // 既に同日のログがある → 既存を返す
    }
    throw err; // それ以外のエラーは再送出
  }
}

/**
 * ユーザーの起床ログを日付降順で取得する。
 * @param limit 取得件数の上限
 */
export async function listWakeLogs(
  userId: string,
  limit = 30,
): Promise<WakeLog[]> {
  const snap = await getDb()
    .collection(COLLECTION)
    .where("userId", "==", userId)
    .orderBy("date", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as WakeLog);
}

/**
 * 直近から遡って連続で success=true だった日数（ストリーク）を計算する。
 * 「日付が連続している」かつ「success=true」が途切れるまでカウントする。
 *
 * @param logs 日付降順のログ（listWakeLogs の戻り値をそのまま渡せる）
 * @param today 起点の日付 "YYYY-MM-DD"。最新ログがこの日 or 前日から始まらないと 0
 */
export function calcStreak(logs: WakeLog[], today: string): number {
  if (logs.length === 0) return 0;

  // 日付昇順のマップにして扱いやすくする
  const byDate = new Map<string, WakeLog>();
  for (const log of logs) byDate.set(log.date, log);

  let streak = 0;
  const cursor = parseDate(today);

  // 起点は「今日」または「昨日」（今朝まだ起きていない場合を許容）
  if (!byDate.has(formatDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!byDate.has(formatDate(cursor))) return 0;
  }

  // 連続して success=true が続く限り遡る
  while (true) {
    const key = formatDate(cursor);
    const log = byDate.get(key);
    if (!log || !log.success) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** "YYYY-MM-DD" → Date（ローカル0時） */
function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "YYYY-MM-DD" */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
