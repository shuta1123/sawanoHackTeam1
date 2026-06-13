// 純粋ロジックのテスト（Emulator 不要）
import { test } from "node:test";
import assert from "node:assert/strict";

import { canTransition, shouldRing } from "../src/alarms.js";
import { calcStreak } from "../src/wakeLogs.js";
import { isValidTime, isValidDate, type Alarm, type WakeLog } from "../src/types.js";

test("canTransition: 許可された遷移のみ true", () => {
  assert.equal(canTransition("scheduled", "ringing"), true);
  assert.equal(canTransition("ringing", "dismissed"), true);
  assert.equal(canTransition("ringing", "failed"), true);
  assert.equal(canTransition("dismissed", "scheduled"), true);
  // 不正な遷移
  assert.equal(canTransition("dismissed", "ringing"), false);
  assert.equal(canTransition("failed", "dismissed"), false);
});

function baseAlarm(over: Partial<Alarm> = {}): Alarm {
  return {
    time: "06:30",
    repeatDays: [],
    status: "scheduled",
    dismissedAt: null,
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...over,
  };
}

test("shouldRing: 時刻窓の内外を判定", () => {
  const alarm = baseAlarm();
  // 6:30 ちょうど → 鳴る
  assert.equal(shouldRing(alarm, new Date(2026, 5, 13, 6, 30)), true);
  // 6:39（窓10分の内） → 鳴る
  assert.equal(shouldRing(alarm, new Date(2026, 5, 13, 6, 39)), true);
  // 6:40（窓10分の外） → 鳴らない
  assert.equal(shouldRing(alarm, new Date(2026, 5, 13, 6, 40)), false);
  // 6:29（時刻前） → 鳴らない
  assert.equal(shouldRing(alarm, new Date(2026, 5, 13, 6, 29)), false);
});

test("shouldRing: 解除済み・失敗は鳴らない", () => {
  const dismissed = baseAlarm({ status: "dismissed" });
  const failed = baseAlarm({ status: "failed" });
  assert.equal(shouldRing(dismissed, new Date(2026, 5, 13, 6, 30)), false);
  assert.equal(shouldRing(failed, new Date(2026, 5, 13, 6, 30)), false);
});

test("shouldRing: 繰り返し曜日が一致しないと鳴らない", () => {
  // 2026-06-13 は土曜日(sat)
  const weekdayOnly = baseAlarm({ repeatDays: ["mon", "tue", "wed", "thu", "fri"] });
  assert.equal(shouldRing(weekdayOnly, new Date(2026, 5, 13, 6, 30)), false);
  const weekend = baseAlarm({ repeatDays: ["sat", "sun"] });
  assert.equal(shouldRing(weekend, new Date(2026, 5, 13, 6, 30)), true);
});

test("calcStreak: 直近からの連続成功日数", () => {
  const logs: WakeLog[] = [
    { userId: "u", date: "2026-06-13", wakeTime: "06:29", success: true },
    { userId: "u", date: "2026-06-12", wakeTime: "06:31", success: true },
    { userId: "u", date: "2026-06-11", wakeTime: "07:10", success: false },
    { userId: "u", date: "2026-06-10", wakeTime: "06:40", success: true },
  ];
  // 6/13 起点 → 6/13, 6/12 が連続成功、6/11 で途切れる
  assert.equal(calcStreak(logs, "2026-06-13"), 2);
});

test("calcStreak: 今日まだ記録が無くても前日からカウント", () => {
  const logs: WakeLog[] = [
    { userId: "u", date: "2026-06-12", wakeTime: "06:31", success: true },
    { userId: "u", date: "2026-06-11", wakeTime: "06:31", success: true },
  ];
  // 6/13 起点だが今日の記録なし → 前日 6/12 から遡って 2
  assert.equal(calcStreak(logs, "2026-06-13"), 2);
});

test("calcStreak: 該当なしは 0", () => {
  assert.equal(calcStreak([], "2026-06-13"), 0);
  const old: WakeLog[] = [
    { userId: "u", date: "2026-06-01", wakeTime: "06:31", success: true },
  ];
  // 起点から離れすぎ（今日・昨日に記録なし） → 0
  assert.equal(calcStreak(old, "2026-06-13"), 0);
});

test("バリデーション関数", () => {
  assert.equal(isValidTime("06:30"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("6:30"), false);
  assert.equal(isValidDate("2026-06-13"), true);
  assert.equal(isValidDate("2026/06/13"), false);
});
