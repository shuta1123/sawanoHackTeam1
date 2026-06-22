// Electron のメインプロセス（Node.js環境で動く、PCアプリの「本体」側）
//
// README の全体アーキテクチャ図では
//   E[Next.js UI] --> D[Electron App] --> C[Cloud Firestore]
// となっており、Next.js の画面(UI)は直接Firestoreを触らず、
// Electron App 側（＝Next.jsのAPI Routes。server.jsのようなもの）を経由する構成にしている。
//
// このファイルの役割は「ウィンドウを開いてNext.jsの画面を表示すること」と
// 「PCカメラ(getUserMedia)の使用許可をElectronに許可させること」の2つだけ。
// Firestoreへの読み書き自体は src/app/api/** （Next.jsのAPI Routes）に実装している。

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// app.isPackaged が false ＝ `npm run dev` などで開発中に起動している状態
const isDev = !app.isPackaged;

// Next.js サーバーのURL。
// 開発時は `next dev` が立てるサーバー（package.json の dev:next）に接続する。
// 本番でも同様に `next start` でNext.jsサーバーを起動した上でこのURLを読み込む想定。
// ※ API Routes（サーバー側処理）を使うため、`next export` による完全な静的書き出しはできない点に注意。
const APP_URL = 'http://localhost:3000';

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    backgroundColor: '#0B0E1A', // 起動時の白フラッシュを防ぐため、デザインのベース背景色と合わせる
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // レンダラーとNode.jsの実行コンテキストを分離（セキュリティ上の推奨設定）
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL);

  if (isDev) {
    // 開発中はDevToolsを別ウィンドウで開いておくとjsQRのデバッグがしやすい
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  // QRコード読取はブラウザAPIの getUserMedia でPCカメラを使う。
  // Electronはデフォルトでメディア(カメラ/マイク)の権限要求をブロックする場合があるため、
  // 明示的に許可するハンドラを登録しておく。
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
      return;
    }
    // メディア以外の権限要求（通知など）は今回使わないため許可しない
    callback(false);
  });

  createMainWindow();

  // macOSの挙動: Dockアイコンクリックでウィンドウが無ければ作り直す
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// 全ウィンドウが閉じたらアプリを終了する（macOS以外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
