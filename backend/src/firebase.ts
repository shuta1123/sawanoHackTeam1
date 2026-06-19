// firebase-admin の初期化
// Emulator 利用時は FIRESTORE_EMULATOR_HOST が設定されていればそちらに接続する。
// 本番接続は GOOGLE_APPLICATION_CREDENTIALS（サービスアカウント）を利用。

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT_ID ??
  "sawano-hack-team1";

let db: Firestore | undefined;

/** Firestore インスタンスを取得（初回のみ初期化） */
export function getDb(): Firestore {
  if (db) return db;

  if (getApps().length === 0) {
    const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

    if (useEmulator) {
      // Emulator 利用時は認証情報不要。projectId だけ渡す。
      initializeApp({ projectId: PROJECT_ID });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // 本番: サービスアカウントの自動読み込み
      initializeApp();
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // 本番: 環境変数に JSON を直接埋め込むケース
      initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      });
    } else {
      throw new Error(
        "Firebase の認証情報が見つかりません。Emulator を使うか GOOGLE_APPLICATION_CREDENTIALS を設定してください。",
      );
    }
  }

  db = getFirestore();
  return db;
}

/** Emulator に接続中かどうか */
export function isEmulator(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}
