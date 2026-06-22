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
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// .env に書く秘密鍵は改行が \n とエスケープされているため、実際の改行コードに戻す
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    'Firebase Admin SDK の環境変数が不足しています。.env.local.example を参考に .env.local を作成してください。'
  );
}

// Next.jsの開発サーバーはホットリロード時にモジュールが再評価されることがあるため、
// 既に初期化済みなら再初期化しない（getApps().length で判定）。
if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export const db = getFirestore();
