# PCアプリ (Electron + Next.js)

sawanoHackTeam1 のフロントエンド（PC）実装です。メインREADMEの設計決定・データ構造に準拠しています。

## アーキテクチャ

```
Next.js UI (React, レンダラー)
      ↓ fetch (同一オリジンのHTTP)
Next.js API Routes (Node.jsランタイム) ← Electronのメインプロセスがこのサーバーを表示するだけ
      ↓ firebase-admin (Admin SDK)
Cloud Firestore
```

メインREADMEのアーキテクチャ図 `E[Next.js UI] --> D[Electron App] --> C[Cloud Firestore]` を、
「Next.js の画面 → Next.jsのAPI Routes → Firestore」という1プロセス内の構成で実現しています。
Admin SDKを使うことで、PC側にFirebase Authenticationのサインイン処理を実装せずに
Firestoreへフルアクセスできるようにしています（サービスアカウント鍵は `.env.local` にのみ置き、
クライアント側のJSバンドルには絶対に含めません）。

## セットアップ

```bash
cd pc-app
npm install
cp .env.local.example .env.local
# .env.local を編集し、FirebaseのサービスアカウントとDEFAULT_USER_IDを設定する
npm run dev
```

`npm run dev` は `next dev`（http://localhost:3000）と Electron を同時に起動します
（`wait-on` がNext.jsサーバーの起動を待ってからElectronを開きます）。

Macでカメラ権限を求められた場合は許可してください。QRコード読取にPCカメラを使います。

## APIエンドポイント一覧

すべて `http://localhost:3000` 配下の Next.js API Routes です。

| Method | Path | 用途 | リクエスト | レスポンス例 |
|---|---|---|---|---|
| GET | `/api/alarm/status` | アラームの現在状態を取得（`ringing`は導出値） | query: `userId` | `{ time, repeatDays, status, dismissedAt, updatedAt, derivedStatus, alarmId }` |
| POST | `/api/alarm/dismiss` | QRコード読取成功時にアラームを解除する | body: `{ "userId": "user001", "alarmId": "xxx"(任意) }` | `{ ok, dismissedAt, alarmId, wakeLog }` |
| GET | `/api/wakelogs` | 起床履歴を新しい順に取得する | query: `userId`, `limit`(任意, 既定14) | `{ logs: WakeLog[] }` |
| GET | `/api/schedule` | 今日の予定を取得する（MVPはハードコード） | query: `userId` | `{ schedule: ScheduleItem[] }` |

実装は `src/app/api/**/route.ts` にあります。

## ディレクトリ構成

```
pc-app/
├── electron/
│   ├── main.js       # ウィンドウ生成・カメラ権限許可
│   └── preload.js    # 現状IPCは未使用（将来の拡張用）
├── src/
│   ├── app/
│   │   ├── page.tsx          # トップページ
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/               # 上表のエンドポイント実装
│   ├── components/
│   │   ├── Dashboard.tsx      # 画面全体のレイアウト
│   │   ├── QRScanner.tsx      # カメラ起動・QR検出・解除API呼び出し
│   │   ├── ScheduleView.tsx   # 今日の予定
│   │   ├── WakeHistory.tsx    # 起床履歴
│   │   └── AlarmStatusBadge.tsx
│   ├── hooks/
│   │   └── useAlarmStatus.ts
│   └── lib/
│       ├── types.ts          # Alarm / WakeLog / ScheduleItem の型
│       ├── config.ts         # DEFAULT_USER_ID
│       ├── firebaseAdmin.ts  # Admin SDK初期化
│       ├── firestore.ts      # Firestore読み書きの実装
│       └── schedule.ts       # ハードコードされた今日の予定
└── .env.local.example
```

## チームで要確認の点（README本文だけでは決まっていなかった部分）

実装にあたり、以下は私の判断で決めました。メインREADMEの「設計決定」に追加する形で
Issueなどで合意を取ることをおすすめします。

1. **このPCが担当するuserIdの決定方法**: メインREADMEは「1ユーザー1アラーム」とのみ記載があり、
   PC側がどのuserIdを使うかは未定義でした。`.env.local` の `DEFAULT_USER_ID` で固定指定する方式にし、
   QRコードから読み取ったuserIdとこの値が一致するかを照合してから解除する、としています。
2. **wakeLogsの書き込み責務**: メインREADMEのデータ構造例には `wakeLogs` の項目はあるものの、
   誰がいつ書くかの記載がありませんでした（`alarms.status` は明記あり）。
   今回は「PCがQR読取＝解除に成功した時にPCが書く（success: true）」とし、
   タイムアウト/緊急停止による失敗時の `wakeLogs`（success: false）の記録は
   **iPhone側の実装に委ねる**想定にしています（iPhone側がstatus: failedを書くタイミングで
   同様にwakeLogsへも書く、という形が自然かと思います）。チームで実装範囲をご確認ください。
3. **Firestoreアクセス方式**: クライアント側でFirebase Web SDKを使う方式ではなく、
   Next.jsのAPI Routes + Firebase Admin SDK（サービスアカウント）に統一しました。
   これによりPC側でのFirebase Authenticationサインイン実装が不要になります。
   バックエンド担当の方とFirestoreのセキュリティルール設計について整合を取ってください
   （Admin SDKはルールを無視してアクセスするため、ルール自体は主に他クライアント＝iPhone用になります）。
4. **「鳴動中」判定でのrepeatDaysの扱い**: メインREADMEの定義（時刻のみの比較）をそのまま実装していますが、
   「今日が対象曜日かどうか」までは見ていません。iPhone側が対象曜日の朝に毎回 `status: scheduled` を
   再セットする前提に依存しているため、その前提が崩れる場合はPC側の導出ロジックにも曜日判定を
   追加する必要があります（`src/app/api/alarm/status/route.ts` にTODOコメントを記載しています）。

## 開発時の制約・未対応事項

* このサンドボックスはネットワークアクセスがないため `npm install` や実際の起動確認は私の側では行えていません。
  上記の手順でローカル環境にて動作確認をお願いします。
* 本番パッケージング（electron-builder等によるインストーラ作成）は対象外にしています。
  ハッカソンのデモ目的では `npm run dev` での起動を想定しています。
* ストリーク機能（連続成功日数表示）はメインREADMEで発展機能扱いのため、今回は未実装です。
  `wakeLogs` の取得関数 (`listWakeLogs`) はすでにあるので、フロント側で連続日数を計算する処理を
  追加するだけで対応できます。
