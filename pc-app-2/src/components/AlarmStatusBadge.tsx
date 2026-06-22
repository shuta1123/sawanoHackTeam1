// ヘッダーに表示する「現在のアラーム状態」バッジ。
// useAlarmStatus フックが5秒おきにポーリングしている値をそのまま表示するだけのコンポーネント。
'use client';

import { useAlarmStatus } from '@/hooks/useAlarmStatus';
import type { DerivedAlarmStatus } from '@/lib/types';
import styles from './AlarmStatusBadge.module.css';

const STATUS_LABEL: Record<DerivedAlarmStatus, string> = {
  scheduled: '未鳴動',
  ringing: '鳴動中',
  dismissed: '解除済み',
  failed: '失敗',
};

export default function AlarmStatusBadge({ userId }: { userId: string }) {
  const status = useAlarmStatus(userId);

  // 初回取得が完了するまでは何も表示しない（レイアウトがガタつくのを避けるため最小限に留める）
  if (!status) return null;

  return (
    <span className={styles.badge} data-status={status.derivedStatus}>
      <span className={styles.dot} aria-hidden="true" />
      {STATUS_LABEL[status.derivedStatus]}
    </span>
  );
}
