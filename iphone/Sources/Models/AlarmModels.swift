import Foundation
import CryptoKit

// MARK: - Helpers

func hashPassword(_ raw: String) -> String {
    let digest = SHA256.hash(data: Data(raw.utf8))
    return digest.map { String(format: "%02hhx", $0) }.joined()
}

// MARK: - Enums

enum AlarmStatus: String, Codable {
    case scheduled
    case dismissed
    case failed
}

// MARK: - Firestore Documents

struct AlarmDocument: Codable {
    var time: String              // "HH:mm"
    var repeatDays: [String]      // ["mon", "tue", ...]
    var status: AlarmStatus
    var dismissedAt: Date?
    var updatedAt: Date
    var emergencyPassword: String

    /// Derived from time — not persisted in Firestore
    var shouldBeRinging: Bool {
        guard status == .scheduled else { return false }
        guard repeatDays.contains(todayWeekdayCode()) else { return false }
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return false }
        let now = Calendar.current.dateComponents([.hour, .minute], from: Date())
        guard let nowH = now.hour, let nowM = now.minute else { return false }
        let alarmMins = parts[0] * 60 + parts[1]
        let nowMins = nowH * 60 + nowM
        return nowMins >= alarmMins && nowMins < alarmMins + 10
    }

    private func todayWeekdayCode() -> String {
        let codes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
        let idx = Calendar.current.component(.weekday, from: Date()) - 1
        return codes[idx]
    }
}

struct WakeLog: Codable, Identifiable {
    let userId: String
    let date: String      // "YYYY-MM-DD"
    let wakeTime: String  // "HH:mm"
    let success: Bool

    var id: String { date }
}

// MARK: - UI Helpers

struct RepeatDay: Identifiable, Hashable {
    let id: String
    let label: String

    static let all: [RepeatDay] = [
        .init(id: "mon", label: "月"),
        .init(id: "tue", label: "火"),
        .init(id: "wed", label: "水"),
        .init(id: "thu", label: "木"),
        .init(id: "fri", label: "金"),
        .init(id: "sat", label: "土"),
        .init(id: "sun", label: "日"),
    ]
}
