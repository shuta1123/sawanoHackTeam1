import Foundation
import FirebaseFirestore
import FirebaseCore

@MainActor
final class FirestoreService: ObservableObject {
    @Published var alarm: AlarmDocument?
    @Published var wakeLogs: [WakeLog] = []
    @Published var alarmScheduleError = false

    // Firebase 未設定時はアクセスしないよう lazy にする
    private lazy var db: Firestore = Firestore.firestore()
    private var alarmListener: ListenerRegistration?

    private var isFirebaseReady: Bool { FirebaseApp.app() != nil }

    // MARK: - Debug Mock Data

    /// Firebase 未設定時に使うモックアラーム。
    /// PC 側のデバッグモードと同様に、デモ・開発用のデータを提供する。
    private static func makeMockAlarm() -> AlarmDocument {
        // 現在時刻から2分後をアラーム時刻にすることで、
        // アプリ起動直後に RingingView の動作確認ができる。
        let now = Date()
        let cal = Calendar.current
        let comps = cal.dateComponents([.hour, .minute], from: now.addingTimeInterval(2 * 60))
        let h = String(format: "%02d", comps.hour ?? 7)
        let m = String(format: "%02d", comps.minute ?? 0)
        return AlarmDocument(
            time: "\(h):\(m)",
            repeatDays: [],          // 単発アラーム
            status: .scheduled,
            dismissedAt: nil,
            updatedAt: now
        )
    }

    private static let mockWakeLogs: [WakeLog] = [
        WakeLog(userId: "user001", date: "2026-06-20", wakeTime: "06:58", success: true),
        WakeLog(userId: "user001", date: "2026-06-19", wakeTime: "07:03", success: true),
        WakeLog(userId: "user001", date: "2026-06-18", wakeTime: "07:11", success: false),
    ]

    // MARK: - Alarm Listener

    func startListening(userId: String) {
        guard isFirebaseReady else {
            print("[FirestoreService] Firebase 未設定のためデバッグモードで起動します。")
            // デバッグモード: モックアラームをセットして動作確認できるようにする
            alarm = Self.makeMockAlarm()
            wakeLogs = Self.mockWakeLogs
            return
        }
        alarmListener?.remove()
        alarmListener = db.collection("alarms")
            .document(userId)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self, error == nil, let snapshot else { return }
                guard snapshot.exists else { return }
                do {
                    let doc = try snapshot.data(as: AlarmDocument.self)
                    Task { @MainActor in
                        let oldStatus = self.alarm?.status
                        self.alarm = doc
                        // scheduled → dismissed/failed = アラーム解除フロー
                        // View に依存せずここで処理することで、RingingView の
                        // ライフサイクル（fullScreenCover の dismissal）と競合しない
                        if oldStatus == .scheduled,
                           doc.status == .dismissed || doc.status == .failed {
                            await self.handleAlarmStopped(
                                alarm: doc, userId: userId, success: doc.status == .dismissed
                            )
                        }
                        await self.resetIfNewDay(userId: userId)
                    }
                } catch {
                    print("[Firestore] alarm decode error: \(error)")
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
        // dismissed (success=true) の wakeLog は PC 側 (POST /api/alarm/dismiss) が書くため iPhone は書かない
        // failed (success=false) は iPhone 側のみが検知できるためここで記録する
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
        alarmListener?.remove()
        alarmListener = nil
    }

    // MARK: - Alarm CRUD

    func saveAlarm(_ alarm: AlarmDocument, userId: String) async throws {
        guard isFirebaseReady else {
            // デバッグモード: メモリ上のアラームを更新する
            self.alarm = alarm
            return
        }
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
        guard isFirebaseReady else {
            // デバッグモード: メモリ上のアラームを failed にして RingingView を閉じる
            if var current = alarm {
                current.status = .failed
                alarm = current
            }
            return
        }
        try await db.collection("alarms").document(userId).updateData([
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
        guard isFirebaseReady else { return }
        try db.collection("wakeLogs").addDocument(from: log)
    }

    // MARK: - Streak

    func currentStreak(userId: String) -> Int {
        calculateStreak(from: wakeLogs)
    }
}
