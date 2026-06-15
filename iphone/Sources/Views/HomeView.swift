import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService

    @State private var showSetup = false
    @State private var showHistory = false

    private var alarm: AlarmDocument? { firestoreService.alarm }
    private var userId: String { authService.user?.uid ?? "" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    streakCard
                    alarmCard
                    actionButtons
                }
                .padding()
            }
            .navigationTitle("AlarmStop")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("ログアウト") { authService.signOut() }
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showSetup) {
                AlarmSetupView()
            }
            .sheet(isPresented: $showHistory) {
                HistoryView()
            }
            .fullScreenCover(isPresented: Binding(
                get: { alarm?.shouldBeRinging == true },
                set: { _ in }
            )) {
                RingingView()
            }
            .task {
                try? await firestoreService.fetchWakeLogs(userId: userId)
            }
        }
    }

    // MARK: - Subviews

    private var streakCard: some View {
        let streak = firestoreService.currentStreak(userId: userId)
        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("連続起床")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(streak)")
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .foregroundStyle(.orange)
                    Text("日")
                        .font(.title2.bold())
                }
            }
            Spacer()
            Image(systemName: streak > 0 ? "flame.fill" : "flame")
                .font(.system(size: 48))
                .foregroundStyle(streak > 0 ? .orange : .secondary)
        }
        .padding(20)
        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
    }

    private var alarmCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("今日のアラーム")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let alarm {
                HStack {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(alarm.time)
                            .font(.system(size: 48, weight: .bold, design: .rounded))

                        HStack(spacing: 6) {
                            ForEach(RepeatDay.all) { day in
                                Text(day.label)
                                    .font(.caption2.bold())
                                    .foregroundStyle(alarm.repeatDays.contains(day.id) ? .white : .secondary)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 3)
                                    .background(
                                        alarm.repeatDays.contains(day.id)
                                            ? Color.orange
                                            : Color.secondary.opacity(0.2),
                                        in: RoundedRectangle(cornerRadius: 4)
                                    )
                            }
                        }
                    }
                    Spacer()
                    statusBadge(alarm.status)
                }
            } else {
                Text("アラームが設定されていません")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func statusBadge(_ status: AlarmStatus) -> some View {
        let (label, color): (String, Color) = switch status {
        case .scheduled: ("設定済み", .blue)
        case .dismissed: ("解除済み", .green)
        case .failed:    ("失敗", .red)
        }
        return Text(label)
            .font(.caption.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color, in: Capsule())
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            Button {
                showSetup = true
            } label: {
                Label("アラームを設定する", systemImage: "alarm.fill")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.orange, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
                    .fontWeight(.semibold)
            }

            Button {
                showHistory = true
            } label: {
                Label("起床履歴を見る", systemImage: "calendar")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.primary)
            }
        }
    }
}
