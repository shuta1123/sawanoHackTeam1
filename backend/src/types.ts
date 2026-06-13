// 共有データモデル
// iPhone(参考)・PC(Electron + Next.js) と揃えるための型定義。
// Firestore のドキュメント構造をそのまま表す。

/** 曜日（繰り返しアラーム用） */
export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const WEEKDAYS: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/**
 * アラームの状態遷移
 *   scheduled → ringing → dismissed
 *                      ↘ failed（最大鳴動時間タイムアウト／緊急停止）
 */
export type AlarmStatus = "scheduled" | "ringing" | "dismissed" | "failed";

export const ALARM_STATUSES: readonly AlarmStatus[] = [
  "scheduled",
  "ringing",
  "dismissed",
  "failed",
] as const;

/**
 * alarms/{userId}
 * MVP は「1ユーザー1アラーム」。ドキュメントID = userId。
 */
export interface Alarm {
  /** 鳴動時刻 "HH:mm" */
  time: string;
  /** 繰り返す曜日。空配列なら単発（次に来るその時刻に鳴る） */
  repeatDays: Weekday[];
  /** 状態。基本は時刻から導出するが、dismissed/failed は明示的に書き込む */
  status: AlarmStatus;
  /** 解除時刻 ISO 8601。未解除は null */
  dismissedAt: string | null;
  /** 最終更新時刻 ISO 8601 */
  updatedAt: string;
}

/**
 * wakeLogs/{autoId}
 * 起床履歴。1日1レコードを想定（同一 userId+date は上書きせず追記しない方針）。
 */
export interface WakeLog {
  userId: string;
  /** 日付 "YYYY-MM-DD" */
  date: string;
  /** 起床（解除）時刻 "HH:mm" */
  wakeTime: string;
  /** 目標時刻内に起床できたか */
  success: boolean;
}

/** 時刻文字列 "HH:mm" の検証 */
export function isValidTime(time: string): boolean {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

/** 日付文字列 "YYYY-MM-DD" の検証 */
export function isValidDate(date: string): boolean {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date);
}
