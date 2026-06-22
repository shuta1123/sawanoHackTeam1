// トップページ（Server Component）。
//
// DEFAULT_USER_ID はサーバー側の環境変数から読むだけのシンプルな値なので、
// ここで読み込んでクライアントコンポーネントにpropsとして渡す
// （クライアント側に環境変数アクセスの仕組みを持たせない、という方針）。
import { DEFAULT_USER_ID } from '@/lib/config';
import Dashboard from '@/components/Dashboard';

export default function Page() {
  return <Dashboard userId={DEFAULT_USER_ID} />;
}
