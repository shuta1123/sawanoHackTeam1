import SwiftUI

struct HistoryView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService
    @Environment(\.dismiss) private var dismiss

    private var logs: [WakeLog] { firestoreService.wakeLogs }
    private var userId: String { authService.user?.uid ?? "" }

    var body: some View {
        NavigationStack {
            Group {
                if logs.isEmpty {
                    ContentUnavailableView(
                        "起床履歴なし",
                        systemImage: "calendar.badge.clock",
                        description: Text("アラームを解除すると記録が残ります")
                    )
                } else {
                    List(logs) { log in
                        HStack {
                            Image(systemName: log.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(log.success ? .green : .red)
                                .font(.title3)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(formattedDate(log.date))
                                    .font(.subheadline.bold())
                                Text("起床時刻: \(log.wakeTime)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text(log.success ? "成功" : "失敗")
                                .font(.caption.bold())
                                .foregroundStyle(log.success ? .green : .red)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("起床履歴")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("閉じる") { dismiss() }
                }
            }
            .task {
                try? await firestoreService.fetchWakeLogs(userId: userId)
            }
        }
    }

    private func formattedDate(_ dateString: String) -> String {
        let input = DateFormatter()
        input.dateFormat = "yyyy-MM-dd"
        let output = DateFormatter()
        output.dateFormat = "M月d日（EEE）"
        output.locale = Locale(identifier: "ja_JP")
        guard let date = input.date(from: dateString) else { return dateString }
        return output.string(from: date)
    }
}
