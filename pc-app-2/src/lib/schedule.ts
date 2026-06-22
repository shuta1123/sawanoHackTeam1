// 「今日の予定表示」のデータ取得部分。
// README 設計決定 #5: MVPではハードコードした予定リストの表示でよい。
// Google/Apple カレンダー連携は発展機能として、この関数の中身を
// 外部カレンダーAPI呼び出しに差し替えるだけで済むようにシグネチャを揃えておく。

import { ScheduleItem } from './types';

// 現時点では userId によらず同じ固定リストを返す（MVPの割り切り）。
// 将来カレンダー連携する際は、ここでuserIdに紐づくアクセストークンを取得して
// Google Calendar API / Apple Calendar (CalDAV) を呼び出す形に置き換える。
export function getTodaySchedule(_userId: string): ScheduleItem[] {
  return [
    { time: '09:00', title: 'チームミーティング' },
    { time: '12:00', title: '昼食' },
    { time: '14:00', title: '開発作業' },
    { time: '19:00', title: 'ジム' },
  ];
}
