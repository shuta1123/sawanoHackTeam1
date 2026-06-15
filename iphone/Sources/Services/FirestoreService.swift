import Foundation
import FirebaseFirestore

@MainActor
final class FirestoreService: ObservableObject {
    @Published var alarm: AlarmDocument?
    @Published var wakeLogs: [WakeLog] = []

    private let db = Firestore.firestore()
    private var alarmListener: ListenerRegistration?

    // MARK: - Alarm Listener

    func startListening(userId: String) {
        alarmListener?.remove()
        alarmListener = db.collection("alarms")
            .document(userId)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil, let snapshot else { return }
                guard snapshot.exists else { return }
                do {
                    let doc = try snapshot.data(as: AlarmDocument.self)
                    Task { @MainActor in self.alarm = doc }
                } catch {
                    print("[Firestore] alarm decode error: \(error)")
                }
            }
    }

    func stopListening() {
        alarmListener?.remove()
        alarmListener = nil
    }

    // MARK: - Alarm CRUD

    func saveAlarm(_ alarm: AlarmDocument, userId: String) async throws {
        try db.collection("alarms").document(userId).setData(from: alarm)
    }

    /// dismissed / failed が前日以前なら scheduled にリセット（繰り返しアラーム用）
    func resetIfNewDay(userId: String) async {
        guard let alarm else { return }
        guard alarm.status == .dismissed || alarm.status == .failed else { return }

        let today = Calendar.current.startOfDay(for: Date())
        // dismissed は dismissedAt、failed は dismissedAt が nil なので updatedAt を使う
        let referenceDate = alarm.dismissedAt ?? alarm.updatedAt
        let referenceDay = Calendar.current.startOfDay(for: referenceDate)
        guard referenceDay < today else { return }

        do {
            try await db.collection("alarms").document(userId).updateData([
                "status": AlarmStatus.scheduled.rawValue,
                "dismissedAt": NSNull(),
                "updatedAt": FieldValue.serverTimestamp()
            ])
        } catch {
            print("[Firestore] resetIfNewDay error: \(error)")
        }
    }

    /// iPhone が緊急停止 or 10分タイムアウト時に呼ぶ
    func markFailed(userId: String) async throws {
        try await db.collection("alarms").document(userId).updateData([
            "status": "failed",
            "updatedAt": FieldValue.serverTimestamp()
        ])
    }

    // MARK: - Wake Logs

    func fetchWakeLogs(userId: String) async throws {
        let snapshot = try await db.collection("wakeLogs")
            .whereField("userId", isEqualTo: userId)
            .order(by: "date", descending: true)
            .limit(to: 30)
            .getDocuments()

        wakeLogs = try snapshot.documents.compactMap {
            try $0.data(as: WakeLog.self)
        }
    }

    func saveWakeLog(_ log: WakeLog) async throws {
        try db.collection("wakeLogs").addDocument(from: log)
    }

    // MARK: - Streak

    func currentStreak(userId: String) -> Int {
        guard !wakeLogs.isEmpty else { return 0 }
        let sorted = wakeLogs
            .filter { $0.success }
            .sorted { $0.date > $1.date }

        var streak = 0
        let calendar = Calendar.current
        var expected = calendar.startOfDay(for: Date())

        for log in sorted {
            guard let logDate = dateFrom(string: log.date) else { break }
            if calendar.isDate(logDate, inSameDayAs: expected) {
                streak += 1
                expected = calendar.date(byAdding: .day, value: -1, to: expected) ?? expected
            } else {
                break
            }
        }
        return streak
    }

    private func dateFrom(string: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: string)
    }
}
