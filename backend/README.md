# backend — Firebase バックエンド

QRアラームの Firestore データアクセス層。iPhone・PC 両アプリから使う共通基盤。

## セットアップ

```bash
cd backend
npm install
# Firebase CLI（未導入なら）
npm install -g firebase-tools
```

## ローカル開発（Firebase Emulator）

```bash
# 1) Emulator 起動（auth + firestore + UI）
npm run emulator
#    UI: http://localhost:4000

# 2) 別ターミナルでシード投入
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed

# 3) テスト（Emulator を自動起動して実行）
npm test
```

## スクリプト

| コマンド | 内容 |
|----------|------|
| `npm run build` | TypeScript ビルド |
| `npm run typecheck` | 型チェックのみ |
| `npm run emulator` | Firebase Emulator 起動 |
| `npm run seed` | Emulator にテストデータ投入 |
| `npm test` | Emulator 上でテスト実行 |

## データモデル

### `alarms/{userId}`（1ユーザー1アラーム）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `time` | string | 鳴動時刻 `"HH:mm"` |
| `repeatDays` | string[] | 繰り返す曜日。空配列なら単発 |
| `status` | string | `scheduled` \| `ringing` \| `dismissed` \| `failed` |
| `dismissedAt` | string \| null | 解除時刻 ISO 8601 |
| `updatedAt` | string | 更新時刻 ISO 8601 |

状態遷移: `scheduled → ringing → dismissed`（タイムアウト/緊急停止で `→ failed`）

### `wakeLogs/{autoId}`（起床履歴）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `userId` | string | ユーザーID |
| `date` | string | `"YYYY-MM-DD"` |
| `wakeTime` | string | 起床時刻 `"HH:mm"` |
| `success` | bool | 目標時刻内に起床できたか |

## 主な API（`src/index.ts` から re-export）

- `getAlarm(userId)` / `setAlarm(userId, {time, repeatDays})`
- `updateStatus(userId, status)` / `dismissAlarm(userId)` / `failAlarm(userId)`
- `shouldRing(alarm, at, windowMinutes)` — 時刻から鳴動判定
- `recordWakeLog(log)` / `listWakeLogs(userId, limit)`
- `calcStreak(logs, today)` — 連続成功日数

## 接続先の切り替え

- **Emulator**: 環境変数 `FIRESTORE_EMULATOR_HOST`（例 `localhost:8080`）が設定されていれば自動接続
- **本番**: `GOOGLE_APPLICATION_CREDENTIALS`（サービスアカウントJSONのパス）または `FIREBASE_SERVICE_ACCOUNT`（JSON文字列）
