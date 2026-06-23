// Firestore に保存するデータ構造の型定義。
// README「データ構造例」セクションに準拠する。

/**
 * alarms/{userId}/items/{alarmId} サブコレクションのドキュメント
 * 複数アラーム対応: ドキュメントID = alarmId（Firestoreが自動生成）
 */
export interface Alarm {
  /** Firestoreドキュメント ID（alarmId）。DBから取得した場合のみ設定される */
  id?: string;
  /** アラーム時刻 "HH:mm" 形式 */
  time: string;
  /** 繰り返す曜日。 "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" */
  repeatDays: string[];
  /**
   * DBに永続化されるstatusは scheduled / dismissed / failed の3種類のみ。
   * ringing はDBに保存せず、time と現在時刻から導出する値（README 設計決定 #4）。
   */
  status: 'scheduled' | 'dismissed' | 'failed';
  /** 解除時刻 (ISO 8601)。failedの場合は更新されないため null のまま */
  dismissedAt: string | null;
  /** ドキュメント最終更新時刻 (ISO 8601) */
  updatedAt: string;
}

/** status に ringing（導出値）を含めたもの。GET /api/alarm/status のレスポンス用 */
export type DerivedAlarmStatus = 'scheduled' | 'ringing' | 'dismissed' | 'failed';

export interface AlarmWithDerivedStatus extends Alarm {
  derivedStatus: DerivedAlarmStatus;
  /** 鳴動中アラームの Firestore ドキュメント ID */
  alarmId?: string;
}

/**
 * wakeLogs ドキュメント（起床履歴1日分）
 * ドキュメントIDは `${userId}_${date}` とし、1日1件に正規化する。
 */
export interface WakeLog {
  userId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** 起床（解除）時刻 "HH:mm" */
  wakeTime: string;
  /** QRコードでの正規解除なら true。タイムアウト/緊急停止による failed は false */
  success: boolean;
}

/** 今日の予定1件分（MVPはハードコードでよい：README 設計決定 #5） */
export interface ScheduleItem {
  /** 開始時刻 "HH:mm" */
  time: string;
  title: string;
}
