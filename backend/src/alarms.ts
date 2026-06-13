// alarms コレクションのデータアクセス層
// ドキュメントID = userId（MVP: 1ユーザー1アラーム）

import { getDb } from "./firebase.js";
import {
  type Alarm,
  type AlarmStatus,
  type Weekday,
  WEEKDAYS,
  isValidTime,
} from "./types.js";

const COLLECTION = "alarms";

/** 許可する状態遷移。これ以外への更新は弾く */
const ALLOWED_TRANSITIONS: Record<AlarmStatus, AlarmStatus[]> = {
  scheduled: ["ringing", "dismissed", "failed", "scheduled"],
  ringing: ["dismissed", "failed", "scheduled"],
  // 解除・失敗後は次のアラームに向けて scheduled に戻せる
  dismissed: ["scheduled"],
  failed: ["scheduled"],
};

/** 状態遷移が許可されているか */
export function canTransition(from: AlarmStatus, to: AlarmStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** アラームを取得。未設定なら null */
export async function getAlarm(userId: string): Promise<Alarm | null> {
  const snap = await getDb().collection(COLLECTION).doc(userId).get();
  return snap.exists ? (snap.data() as Alarm) : null;
}

export interface SetAlarmInput {
  time: string;
  repeatDays?: Weekday[];
}

/**
 * アラームを設定（新規作成 or 上書き）。status は scheduled にリセットする。
 * 主に iPhone アプリから呼ばれる想定。
 */
export async function setAlarm(
  userId: string,
  input: SetAlarmInput,
): Promise<Alarm> {
  if (!isValidTime(input.time)) {
    throw new Error(`不正な時刻形式です: ${input.time}（"HH:mm" で指定）`);
  }
  const repeatDays = input.repeatDays ?? [];
  for (const d of repeatDays) {
    if (!WEEKDAYS.includes(d)) {
      throw new Error(`不正な曜日です: ${d}`);
    }
  }

  const alarm: Alarm = {
    time: input.time,
    repeatDays,
    status: "scheduled",
    dismissedAt: null,
    updatedAt: nowIso(),
  };
  await getDb().collection(COLLECTION).doc(userId).set(alarm);
  return alarm;
}

/**
 * 状態を更新する。許可された遷移のみ通す。
 * dismissed に更新する場合は dismissedAt を打刻する。
 */
export async function updateStatus(
  userId: string,
  to: AlarmStatus,
): Promise<Alarm> {
  const ref = getDb().collection(COLLECTION).doc(userId);

  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error(`アラームが存在しません: userId=${userId}`);
    }
    const current = snap.data() as Alarm;

    if (current.status === to) {
      return current; // 冪等: 同じ状態への更新は何もしない
    }
    if (!canTransition(current.status, to)) {
      throw new Error(
        `不正な状態遷移です: ${current.status} → ${to}`,
      );
    }

    const updated: Alarm = {
      ...current,
      status: to,
      dismissedAt: to === "dismissed" ? nowIso() : current.dismissedAt,
      updatedAt: nowIso(),
    };
    tx.set(ref, updated);
    return updated;
  });
}

/**
 * QR 読取成功時にアラームを解除する（PC から呼ばれる想定）。
 */
export function dismissAlarm(userId: string): Promise<Alarm> {
  return updateStatus(userId, "dismissed");
}

/**
 * フェイルセーフ: 最大鳴動時間タイムアウト／緊急停止で失敗扱いにする。
 */
export function failAlarm(userId: string): Promise<Alarm> {
  return updateStatus(userId, "failed");
}

/**
 * 与えられた時刻に「鳴動すべきか」を判定する（status を時刻から導出する補助）。
 * @param alarm 対象アラーム
 * @param at 判定する時刻
 * @param windowMinutes 鳴動とみなす時間窓（分）。デフォルト10分（フェイルセーフと一致）
 */
export function shouldRing(
  alarm: Alarm,
  at: Date,
  windowMinutes = 10,
): boolean {
  if (alarm.status === "dismissed" || alarm.status === "failed") {
    return false;
  }
  // 繰り返し設定がある場合は曜日が一致しないと鳴らない
  if (alarm.repeatDays.length > 0) {
    const today = WEEKDAYS[at.getDay()];
    if (!alarm.repeatDays.includes(today)) return false;
  }

  const [h, m] = alarm.time.split(":").map(Number);
  const alarmMinutes = h * 60 + m;
  const nowMinutes = at.getHours() * 60 + at.getMinutes();
  const diff = nowMinutes - alarmMinutes;
  return diff >= 0 && diff < windowMinutes;
}
