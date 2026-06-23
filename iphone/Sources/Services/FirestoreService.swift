import Foundation
import FirebaseFirestore
import FirebaseCore
import FirebaseAuth

@MainActor
final class FirestoreService: ObservableObject {
    /// 全アラームリスト（複数アラーム対応）
    @Published var alarms: [AlarmDocument] = []
    @Published var wakeLogs: [WakeLog] = []
    @Published var alarmScheduleError = false

    // Firebase 未設定時はアクセスしないよう lazy にする
    private lazy var db: Firestore = Firestore.firestore()
    private var alarmsListener: ListenerRegistration?

    /// Firebase 初期化済みの場合に true
    private var isFirebaseReady: Bool {
        FirebaseApp.app() != nil
    }

    // MARK: - Backward-Compat Computed Properties

    /// 現在鳴動中のアラーム（RingingView 用）
    var ringingAlarm: AlarmDocument? {
        alarms.first(where: { $0.shouldBeRinging })
    }

    /// 後方互換: 単一アラームを参照していた箇所向け（鳴動中 → なければ先頭）
    var alarm: AlarmDocument? { ringingAlarm ?? alarms.first }

    // MARK: - Debug Mock Data

    private static func makeMockAlarms() -> [AlarmDocument] {
        let now = Date()
        let cal = Calendar.current
        let comps = cal.dateComponents([.hour, .minute], from: now.addingTimeInterval(2 * 60))
        let h = String(format: "%02d", comps.hour ?? 7)
        let m = String(format: "%02d", comps.minute ?? 0)
        return [
            AlarmDocument(
                time: "\(h):\(m)",
                repeatDays: [],
                status: .scheduled,
                dismissedAt: nil,
                updatedAt: now
            ),
            AlarmDocument(
                time: "07:00",
                repeatDays: ["mon", "tue", "wed", "thu", "fri"],
                status: .scheduled,
                dismissedAt: nil,
                updatedAt: now
            ),
        ]
    }

    private static let mockWakeLogs: [WakeLog] = [
        WakeLog(userId: "user001", date: "2026-06-20", wakeTime: "06:58", success: true),
        WakeLog(userId: "user001", date: "2026-06-19", wakeTime: "07:03", success: true),
        WakeLog(userId: "user001", date: "2026-06-18", wakeTime: "07:11", success: false),
    ]

    // MARK: - Alarm Listener

    /// alarms/{userId}/items サブコレクションをリアルタイム監視
    func startListening(userId: String) {
        guard isFirebaseReady else {
            print("[FirestoreService] Firebase 未設定のためデバッグモードで起動します。")
            alarms = Self.makeMockAlarms()
            wakeLogs = Self.mockWakeLogs
            return
        }
        alarmsListener?.remove()
        alarmsListener = db
            .collection("alarms").document(userId)
            .collection("items")
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil, let snapshot else { return }
                do {
                    let docs = try snapshot.documents.map { try $0.data(as: AlarmDocument.self) }
                    Task { @MainActor in
                        let oldRinging = self.ringingAlarm
                        self.alarms = docs.sorted { $0.time < $1.time }

                        // 鳴動中アラームが dismissed/failed になったらアフター処理
                        if let old = oldRinging,
                           let updated = self.alarms.first(where: { $0.id == old.id }),
                           old.status == .scheduled,
                           updated.status == .dismissed || updated.status == .failed {
                            await self.handleAlarmStopped(
                                alarm: updated, userId: userId, success: updated.status == .dismissed
                            )
                        }
                        await self.resetOldAlarms(userId: userId)
                    }
                } catch {
                    print("[Firestore] alarms decode error: \(error)")
                }
            }
    }

    private func handleAlarmStopped(alarm: AlarmDocument, userId: String, success: Bool) async {
        try? await AlarmService.shared.cancel()
        if !alarm.repeatDays.isEmpty {
            do {
                try await AlarmService.shared.schedule(
                    time: alarm.time, repeatDays: alarm.repeatDays, userId: userId
                )
            } catch {
                alarmScheduleError = true
            }
        }
        if !success {
            let log = WakeLog(
                userId: userId,
                date: nowDateString(),
                wakeTime: nowTimeString(),
                success: false
            )
            try? await saveWakeLog(log)
        }
        try? await fetchWakeLogs(userId: userId)
    }

    private func nowDateString() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private func nowTimeString() -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: Date())
    }

    func stopListening() {
        alarmsListener?.remove()
        alarmsListener = nil
    }

    // MARK: - Alarm CRUD

    /// アラームを保存（id があれば上書き、なければ新規追加）
    func saveAlarm(_ alarm: AlarmDocument, userId: String) async throws {
        guard isFirebaseReady else {
            if let idx = alarms.firstIndex(where: { $0.id == alarm.id }) {
                alarms[idx] = alarm
            } else {
                var newAlarm = alarm
                if newAlarm.id == nil {
                    newAlarm.id = UUID().uuidString
                }
                alarms.append(newAlarm)
            }
            return
        }

        let items = db
            .collection("alarms").document(userId)
            .collection("items")

        // Firestore.Encoder で辞書に変換してから async setData([String:Any]) を使う
        // （setData(from: Codable) の async 版はこの SDK バージョンに存在しないため）
        let encoded = try Firestore.Encoder().encode(alarm)

        if let alarmId = alarm.id {
            try await items.document(alarmId).setData(encoded)
        } else {
            try await items.document().setData(encoded)
        }
    }

    /// アラームを削除
    func deleteAlarm(alarmId: String, userId: String) async throws {
        guard isFirebaseReady else {
            alarms.removeAll { $0.id == alarmId }
            return
        }
        try await db
            .collection("alarms").document(userId)
            .collection("items")
            .document(alarmId)
            .delete()
    }

    /// 前日以前に dismissed/failed になった【繰り返し】アラームを scheduled にリセット
    /// 単発アラーム（repeatDays が空）はリセットしない
    func resetOldAlarms(userId: String) async {
        let today = Calendar.current.startOfDay(for: Date())
        for alarm in alarms {
            // 単発アラームはリセットしない
            guard !alarm.repeatDays.isEmpty else { continue }
            guard alarm.status == .dismissed || alarm.status == .failed,
                  let alarmId = alarm.id else { continue }
            let referenceDate = alarm.dismissedAt ?? alarm.updatedAt
            let referenceDay = Calendar.current.startOfDay(for: referenceDate)
            guard referenceDay < today else { continue }

            do {
                try await db
                    .collection("alarms").document(userId)
                    .collection("items")
                    .document(alarmId)
                    .updateData([
                        "status": AlarmStatus.scheduled.rawValue,
                        "dismissedAt": NSNull(),
                        "updatedAt": FieldValue.serverTimestamp()
                    ])
            } catch {
                print("[Firestore] resetOldAlarms error for \(alarmId): \(error)")
            }
        }
    }

    // 後方互換: ContentView/AlarmSetupView から呼ばれる旧 resetIfNewDay
    func resetIfNewDay(userId: String) async {
        await resetOldAlarms(userId: userId)
    }

    /// 鳴動中のアラームを failed にマーク
    func markFailed(userId: String) async throws {
        guard isFirebaseReady else {
            if let idx = alarms.indices.first(where: { alarms[$0].shouldBeRinging }) {
                alarms[idx].status = .failed
            }
            return
        }
        guard let ringing = ringingAlarm, let alarmId = ringing.id else { return }
        try await db
            .collection("alarms").document(userId)
            .collection("items")
            .document(alarmId)
            .updateData([
                "status": "failed",
                "updatedAt": FieldValue.serverTimestamp()
            ])
    }

    // MARK: - Wake Logs

    func fetchWakeLogs(userId: String) async throws {
        guard isFirebaseReady else {
            wakeLogs = Self.mockWakeLogs
            return
        }
        // order(by:) + whereField の複合インデックス不要にするためクライアントソート
        let snapshot = try await db.collection("wakeLogs")
            .whereField("userId", isEqualTo: userId)
            .limit(to: 30)
            .getDocuments()

        wakeLogs = try snapshot.documents.compactMap {
            try $0.data(as: WakeLog.self)
        }.sorted { $0.date > $1.date }
    }

    func saveWakeLog(_ log: WakeLog) async throws {
        guard isFirebaseReady else { return }
        let encoded = try Firestore.Encoder().encode(log)
        try await db.collection("wakeLogs").document().setData(encoded)
    }

    // MARK: - Streak

    func currentStreak(userId: String) -> Int {
        calculateStreak(from: wakeLogs)
    }
}
