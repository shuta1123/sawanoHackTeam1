// Firebase Admin SDK の初期化。
//
// 設計方針: PCアプリ(Electron)からのFirestoreアクセスは、
// Next.jsのAPI Routes（Node.jsランタイムで動くサーバー側コード）からのみ行う。
// これにより、
//  - クライアント(レンダラー)側にサービスアカウント等の秘密情報を一切持たせない
//  - Firebase Authenticationによるサインインフローを別途PC側に実装しなくてよい
//    （Admin SDKはセキュリティルールを無視してFirestoreにフルアクセスできるため）
// というメリットがある。
//
// 重要: このファイルは絶対にクライアントコンポーネント（'use client'のファイル）からimportしないこと。
// サービスアカウントの秘密鍵がブラウザ側バンドルに漏れる事故を防ぐため。

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// ── 認証情報の取得 ──────────────────────────────────────────────────────
// 以下の優先順位で Firebase を初期化する:
//   1. Firestore エミュレーター（FIRESTORE_EMULATOR_HOST が設定されている場合）
//   2. サービスアカウント JSON を環境変数に直接埋め込む（FIREBASE_SERVICE_ACCOUNT）
//   3. 個別の環境変数（FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY）
//   4. サービスアカウントキーファイル（GOOGLE_APPLICATION_CREDENTIALS）

const projectId =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.GCLOUD_PROJECT ??
  'sawano-hack-team1';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// .env に書く秘密鍵は改行が \n とエスケープされているため、実際の改行コードに戻す
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

/**
 * Firebase の設定が揃っているかどうか。
 * false の場合はデバッグモードとして動作し、Firestore アクセスの代わりにモックデータを返す。
 */
export const isFirebaseReady = Boolean(
  useEmulator ||
  serviceAccountJson ||
  (projectId && clientEmail && privateKey) ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

let _db: Firestore | null = null;

if (isFirebaseReady) {
  // Next.jsの開発サーバーはホットリロード時にモジュールが再評価されることがあるため、
  // 既に初期化済みなら再初期化しない（getApps().length で判定）。
  if (!getApps().length) {
    if (useEmulator) {
      // Emulator 利用時は認証情報不要
      initializeApp({ projectId });
    } else if (serviceAccountJson) {
      // サービスアカウント JSON を環境変数に直接埋め込むケース（CI/CD や Vercel 向け）
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
    } else if (clientEmail && privateKey) {
      // 個別の環境変数から認証情報を組み立てるケース（従来方式）
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });
    } else {
      // GOOGLE_APPLICATION_CREDENTIALS による自動読み込み
      initializeApp();
    }
  }
  _db = getFirestore();
} else {
  console.warn(
    '[AlarmStop PC] ⚠️ Firebase 環境変数が未設定のためデバッグモードで起動します。' +
    ' .env.local.example を参考に .env.local を作成してください。'
  );
}

export const db: Firestore | null = _db;
