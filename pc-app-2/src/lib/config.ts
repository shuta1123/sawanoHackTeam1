// アプリ全体で使う設定値。
//
// MVPは「1ユーザー1アラーム」前提（README データ構造例を参照）で、複数ユーザーのログイン機能は持たない。
// そのため「このPCがどのuserIdを担当するか」を環境変数で固定指定する方式にしている。
// （QRコード読取時には、読み取った値とこのIDが一致するかを照合する。QRScannerコンポーネント参照）
//
// NEXT_PUBLIC_ を付けていないのは、Server Component（page.tsx）側でのみ読み込み、
// props経由でクライアントに渡す方が、環境変数の扱いとして一段安全なため。
export const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID ?? 'user001';
