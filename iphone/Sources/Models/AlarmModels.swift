import Foundation
import CommonCrypto
import Security

// MARK: - Helpers

/// PBKDF2-SHA256 (100,000 iterations) で userId を salt にして stretch する。
/// salt なし SHA-256 より辞書攻撃耐性が大幅に向上する。
func hashPassword(_ raw: String, userId: String) -> String {
    let passwordData = Data(raw.utf8)
    let saltData = Data((userId + ".alarmstop-v1").utf8)
    var derived = [UInt8](repeating: 0, count: 32)
    passwordData.withUnsafeBytes { pwPtr in
        saltData.withUnsafeBytes { saltPtr in
            _ = CCKeyDerivationPBKDF(
                CCPBKDFAlgorithm(kCCPBKDF2),
                pwPtr.baseAddress?.assumingMemoryBound(to: CChar.self),
                passwordData.count,
                saltPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
                saltData.count,
                CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                100_000,
                &derived, 32
            )
        }
    }
    return derived.map { String(format: "%02hhx", $0) }.joined()
}

// MARK: - Keychain (Emergency Password)
// emergencyPassword は Firestore に置かず端末の Keychain にのみ保存する。
// バックエンドの Alarm 型 / firestore.rules と一致させるための措置。

private let keychainService = "com.sawanohackteam1.alarmstop"

func saveEmergencyPassword(_ hash: String, userId: String) {
    let key = "ep_\(userId)"
    let data = Data(hash.utf8)
    let query: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: keychainService,
        kSecAttrAccount: key,
        kSecValueData: data
    ]
    SecItemDelete(query as CFDictionary)
    SecItemAdd(query as CFDictionary, nil)
}

func loadEmergencyPassword(userId: String) -> String? {
    let key = "ep_\(userId)"
    let query: [CFString: Any] = [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: keychainService,
        kSecAttrAccount: key,
        kSecReturnData: true,
        kSecMatchLimit: kSecMatchLimitOne
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
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
    // emergencyPassword は Keychain に保存するため Firestore には書かない
    // → backend/src/types.ts の Alarm 型・firestore.rules と一致

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
