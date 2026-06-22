// preloadスクリプト: レンダラー（Next.jsの画面）が読み込まれる前に実行される。
//
// 現状、Firestoreへのアクセスは全てNext.jsのAPI Routes経由のHTTP通信(fetch)に統一しているため、
// ElectronのIPC（メイン↔レンダラー間通信）は使っていない。
// 将来「OS標準の通知を出す」「ウィンドウを最前面に固定する」など、
// Node.js/Electron固有の機能が必要になった場合はここに contextBridge.exposeInMainWorld で追加する。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronInfo', {
  isElectron: true,
});
