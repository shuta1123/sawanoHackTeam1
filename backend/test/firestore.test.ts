// Firestore 統合テスト（Emulator 必須）
// 実行は npm test 経由（firebase emulators:exec で FIRESTORE_EMULATOR_HOST が設定される）
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { getDb, isEmulator } from "../src/firebase.js";
import {
  getAlarm,
  setAlarm,
  updateStatus,
  dismissAlarm,
  failAlarm,
} from "../src/alarms.js";
import { recordWakeLog, listWakeLogs } from "../src/wakeLogs.js";

const USER = "test-user";

before(() => {
  assert.ok(isEmulator(), "Emulator 上で実行してください（npm test）");
});

// 各テスト前にコレクションをクリア
beforeEach(async () => {
  const db = getDb();
  for (const col of ["alarms", "wakeLogs"]) {
    const snap = await db.collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

test("setAlarm → getAlarm で取得できる", async () => {
  await setAlarm(USER, { time: "06:30", repeatDays: ["mon", "fri"] });
  const alarm = await getAlarm(USER);
  assert.equal(alarm?.time, "06:30");
  assert.equal(alarm?.status, "scheduled");
  assert.deepEqual(alarm?.repeatDays, ["mon", "fri"]);
  assert.equal(alarm?.dismissedAt, null);
});

test("setAlarm: 不正な時刻は例外", async () => {
  await assert.rejects(() => setAlarm(USER, { time: "25:00" }));
});

test("dismissAlarm: scheduled → dismissed で dismissedAt が打刻される", async () => {
  await setAlarm(USER, { time: "06:30" });
  const result = await dismissAlarm(USER);
  assert.equal(result.status, "dismissed");
  assert.notEqual(result.dismissedAt, null);
});

test("updateStatus: 不正な遷移は例外", async () => {
  await setAlarm(USER, { time: "06:30" });
  await dismissAlarm(USER);
  // dismissed → ringing は不可
  await assert.rejects(() => updateStatus(USER, "ringing"));
});

test("failAlarm: フェイルセーフで failed になる", async () => {
  await setAlarm(USER, { time: "06:30" });
  await updateStatus(USER, "ringing");
  const result = await failAlarm(USER);
  assert.equal(result.status, "failed");
});

test("updateStatus: 同一状態への更新は冪等", async () => {
  await setAlarm(USER, { time: "06:30" });
  const r = await updateStatus(USER, "scheduled");
  assert.equal(r.status, "scheduled");
});

test("recordWakeLog: 重複日付は1件のみ", async () => {
  await recordWakeLog({ userId: USER, date: "2026-06-13", wakeTime: "06:33", success: true });
  await recordWakeLog({ userId: USER, date: "2026-06-13", wakeTime: "06:40", success: false });
  const logs = await listWakeLogs(USER);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].wakeTime, "06:33"); // 最初の記録が残る
});

test("listWakeLogs: 日付降順で取得", async () => {
  await recordWakeLog({ userId: USER, date: "2026-06-11", wakeTime: "06:33", success: true });
  await recordWakeLog({ userId: USER, date: "2026-06-13", wakeTime: "06:33", success: true });
  await recordWakeLog({ userId: USER, date: "2026-06-12", wakeTime: "06:33", success: true });
  const logs = await listWakeLogs(USER);
  assert.deepEqual(
    logs.map((l) => l.date),
    ["2026-06-13", "2026-06-12", "2026-06-11"],
  );
});
