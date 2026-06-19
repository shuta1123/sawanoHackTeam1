// Firebase Emulator にテストデータを投入するスクリプト
// 実行: npm run seed （事前に npm run emulator で Emulator を起動しておく）

import { getDb, isEmulator } from "../src/index.js";
import { setAlarm, recordWakeLog } from "../src/index.js";
import type { WakeLog } from "../src/index.js";

async function main(): Promise<void> {
  if (!isEmulator()) {
    throw new Error(
      "安全のため Emulator 接続時のみ実行できます。FIRESTORE_EMULATOR_HOST を設定してください。",
    );
  }

  const userId = "user001";
  console.log(`シード投入を開始: userId=${userId}`);

  // 平日 6:30 のアラーム
  await setAlarm(userId, {
    time: "06:30",
    repeatDays: ["mon", "tue", "wed", "thu", "fri"],
  });
  console.log("alarms 投入完了");

  // 直近の起床ログ（連続成功 + 途中失敗あり）
  const logs: WakeLog[] = [
    { userId, date: "2026-06-09", wakeTime: "06:33", success: true },
    { userId, date: "2026-06-10", wakeTime: "06:40", success: true },
    { userId, date: "2026-06-11", wakeTime: "07:10", success: false },
    { userId, date: "2026-06-12", wakeTime: "06:31", success: true },
    { userId, date: "2026-06-13", wakeTime: "06:29", success: true },
  ];
  for (const log of logs) {
    await recordWakeLog(log);
  }
  console.log(`wakeLogs 投入完了: ${logs.length} 件`);

  // 確認用ダンプ
  const alarmSnap = await getDb().collection("alarms").doc(userId).get();
  console.log("alarms/user001 =", alarmSnap.data());
}

main()
  .then(() => {
    console.log("シード投入が完了しました");
    process.exit(0);
  })
  .catch((err) => {
    console.error("シード投入に失敗しました:", err);
    process.exit(1);
  });
