import Foundation
import AlarmKit

// AlarmKit は iOS 26 以上でのみ利用可能。
// Entitlement: com.apple.developer.alarmkit = true
// Info.plist:  NSAlarmKitUsageDescription

// TODO: Xcode 26 で実機確認の上、schedule API のシグネチャを確定させること。
// 以下は WWDC25 の発表ベースの実装。

struct WakeAlarmAttributes: AlarmAttributes {
    struct ContentState: Codable, Hashable {
        var stopTime: Date
    }
    var userId: String
    var alarmLabel: String
}

@MainActor
final class AlarmService: ObservableObject {
    static let shared = AlarmService()

    private let manager = AlarmManager.shared
    private let alarmID = "com.sawanohackteam1.morning-alarm"

    // MARK: - Schedule

    func schedule(time: String, repeatDays: [String], userId: String) async throws {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { throw AlarmError.invalidTime }

        var components = DateComponents()
        components.hour = parts[0]
        components.minute = parts[1]
        components.second = 0

        let weekdays = repeatDays.compactMap { dayToLocaleWeekday($0) }

        let attributes = WakeAlarmAttributes(
            userId: userId,
            alarmLabel: "起床アラーム"
        )
        let stopTime = Calendar.current.date(
            from: DateComponents(hour: parts[0], minute: parts[1] + 10)
        ) ?? Date().addingTimeInterval(600)
        let contentState = WakeAlarmAttributes.ContentState(stopTime: stopTime)

        // TODO: iOS 26 AlarmKit の正式 API で検証する
        if weekdays.isEmpty {
            let fireDate = nextAlarmDate(hour: parts[0], minute: parts[1])
            try await manager.schedule(
                id: alarmID,
                schedule: .oneTime(date: fireDate),
                attributes: attributes,
                contentState: contentState
            )
        } else {
            try await manager.schedule(
                id: alarmID,
                schedule: .repeating(weekdays: weekdays, time: components),
                attributes: attributes,
                contentState: contentState
            )
        }
    }

    // MARK: - Cancel

    func cancel() async throws {
        try await manager.cancel(id: alarmID)
    }

    // MARK: - Helpers

    private func dayToLocaleWeekday(_ code: String) -> Locale.Weekday? {
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
