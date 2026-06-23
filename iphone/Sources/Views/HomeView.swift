import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService

    @State private var showSetup = false
    @State private var showHistory = false
    @State private var editingAlarm: AlarmDocument? = nil
    @State private var now = Date()

    private var alarms: [AlarmDocument] { firestoreService.alarms }
    private var userId: String { authService.currentUserId ?? "" }

    private var nowString: String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: now)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    streakCard
                    debugClockCard
                    alarmsSection
                }
                .padding()
            }
            .navigationTitle("AlarmStop")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("ログアウト") { authService.signOut() }
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        editingAlarm = nil
                        showSetup = true
                    } label: {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                    }
                }
            }
            .sheet(isPresented: $showSetup) {
                AlarmSetupView(editingAlarm: editingAlarm)
            }
            .sheet(isPresented: $showHistory) {
                HistoryView()
            }
            .fullScreenCover(isPresented: Binding(
                get: { firestoreService.ringingAlarm != nil },
                set: { _ in }
            )) {
                RingingView()
            }
            .alert("次回アラームの再登録に失敗", isPresented: $firestoreService.alarmScheduleError) {
                Button("OK") {}
            } message: {
                Text("AlarmKit への再登録が失敗しました。\n設定画面でアラームを再設定してください。")
            }
            .task {
                try? await firestoreService.fetchWakeLogs(userId: userId)
            }
            .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { t in
                now = t
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

    // MARK: - Debug Clock

    private var debugClockCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "ant.fill")
                    .foregroundStyle(.purple)
                Text("デバッグ")
                    .font(.caption.bold())
                    .foregroundStyle(.purple)
            }

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("現在時刻")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(nowString)
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .foregroundStyle(.purple)
            }

            Divider()

            ForEach(alarms) { alarm in
                let ringing = alarm.isRinging(at: now)
                HStack {
                    Text("⏰ \(alarm.time)")
                        .font(.system(.caption, design: .monospaced))
                    Spacer()
                    if ringing {
                        Text("🔔 鳴動中")
                            .font(.caption.bold())
                            .foregroundStyle(.orange)
                    } else if alarm.status == .scheduled {
                        Text("待機中")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(alarm.status.rawValue)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if alarms.isEmpty {
                Text("アラームなし")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(.purple.opacity(0.3), lineWidth: 1)
        )
    }

    private var alarmsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("アラーム")
                    .font(.headline)
                Spacer()
                Button {
                    showHistory = true
                } label: {
                    Label("起床履歴", systemImage: "calendar")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if alarms.isEmpty {
                emptyAlarmsView
            } else {
                VStack(spacing: 10) {
                    ForEach(alarms) { alarm in
                        alarmRow(alarm)
                    }
                }
            }
        }
    }

    private var emptyAlarmsView: some View {
        VStack(spacing: 12) {
            Image(systemName: "alarm")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("アラームがありません")
                .foregroundStyle(.secondary)
            Text("右上の + で追加してください")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func alarmRow(_ alarm: AlarmDocument) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text(alarm.time)
                    .font(.system(size: 36, weight: .bold, design: .rounded))

                if alarm.repeatDays.isEmpty {
                    Text("繰り返しなし")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    HStack(spacing: 4) {
                        ForEach(RepeatDay.all) { day in
                            Text(day.label)
                                .font(.caption2.bold())
                                .foregroundStyle(alarm.repeatDays.contains(day.id) ? .white : .secondary)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(
                                    alarm.repeatDays.contains(day.id)
                                        ? Color.orange
                                        : Color.secondary.opacity(0.15),
                                    in: RoundedRectangle(cornerRadius: 4)
                                )
                        }
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 8) {
                statusBadge(alarm.status)
                if alarm.shouldBeRinging {
                    Label("鳴動中", systemImage: "bell.fill")
                        .font(.caption2.bold())
                        .foregroundStyle(.orange)
                }
                Button {
                    guard let alarmId = alarm.id else { return }
                    Task {
                        try? await firestoreService.deleteAlarm(alarmId: alarmId, userId: userId)
                    }
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.red.opacity(0.7))
                        .padding(6)
                }
            }
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .contentShape(RoundedRectangle(cornerRadius: 14))
        .onTapGesture {
            editingAlarm = alarm
            showSetup = true
        }
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
}
