import Foundation

// TODO: Xcode 26.3 で AlarmKit.AlarmAttributes の正確な型定義を確認して実装する。
// WWDC25 発表時は AlarmAttributes はプロトコルだったが、Xcode 26.3 では
// generic type（クラス）に変更された模様。API 確定後に AlarmKit 実装を復元する。
//
// 元の実装（保存用）:
// import AlarmKit
// struct WakeAlarmAttributes: AlarmKit.AlarmAttributes {
//     struct ContentState: Codable, Hashable { var stopTime: Date }
//     var userId: String
//     var alarmLabel: String
// }

@MainActor
final class AlarmService: ObservableObject {
    static let shared = AlarmService()

    private let alarmID = "com.sawanohackteam1.morning-alarm"

    // MARK: - Schedule

    func schedule(time: String, repeatDays: [String], userId: String) async throws {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { throw AlarmError.invalidTime }

        // TODO: AlarmKit API 確定後に実装を復元する
        // 現在は AlarmAttributes の型パラメータが未確定のためスタブ
        // let weekdays = repeatDays.compactMap { dayToLocaleWeekday($0) }
        // let manager = AlarmManager.shared
        // try await manager.schedule(id: alarmID, schedule: ..., attributes: ..., contentState: ...)
    }

    // MARK: - Cancel

    func cancel() async throws {
        // TODO: AlarmKit API 確定後に実装を復元する
        // try await AlarmManager.shared.cancel(id: alarmID)
    }

    // MARK: - Helpers

    func dayToLocaleWeekday(_ code: String) -> Locale.Weekday? {
        switch code {
        case "sun": return .sunday
        case "mon": return .monday
        case "tue": return .tuesday
        case "wed": return .wednesday
        case "thu": return .thursday
        case "fri": return .friday
        case "sat": return .saturday
        default:    return nil
        }
    }

    private func nextAlarmDate(hour: Int, minute: Int) -> Date {
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comps.hour = hour
        comps.minute = minute
        comps.second = 0
        var date = Calendar.current.date(from: comps) ?? Date()
        if date <= Date() {
            date = Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date
        }
        return date
    }

    enum AlarmError: Error {
        case invalidTime
    }
}
