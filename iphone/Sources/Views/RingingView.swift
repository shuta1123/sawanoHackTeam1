import SwiftUI

private let maxRingingSeconds = 10 * 60  // 10分

struct RingingView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService

    @State private var secondsRemaining = maxRingingSeconds
    @State private var showEmergencyStop = false
    @State private var emergencyInput = ""
    @State private var emergencyError = ""
    @State private var isDismissed = false
    @State private var isFailed = false
    @State private var isHandlingFailure = false
    @State private var scheduleFailedAfterCancel = false

    private var userId: String { authService.user?.uid ?? "" }
    private var alarm: AlarmDocument? { firestoreService.alarm }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isDismissed {
                dismissedOverlay
            } else if isFailed {
                failedOverlay
            } else {
                ringingContent
            }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { _ in
            guard !isDismissed && !isFailed && !isHandlingFailure else { return }
            if secondsRemaining > 0 {
                secondsRemaining -= 1
            } else {
                isHandlingFailure = true
                Task { await performFailure() }
            }
        }
        .onChange(of: firestoreService.alarm?.status) { _, status in
            if status == .dismissed {
                isDismissed = true
                Task {
                    // 現在の鳴動を止め、繰り返し設定があれば次回以降を再登録する
                    // cancel() は同一 ID のアラームを完全削除するため、再登録が必要
                    try? await AlarmService.shared.cancel()
                    if let a = alarm, !a.repeatDays.isEmpty {
                        do {
                            try await AlarmService.shared.schedule(
                                time: a.time, repeatDays: a.repeatDays, userId: userId
                            )
                        } catch {
                            scheduleFailedAfterCancel = true
                        }
                    }
                    let log = WakeLog(
                        userId: userId,
                        date: todayString(),
                        wakeTime: currentTimeString(),
                        success: true
                    )
                    try? await firestoreService.saveWakeLog(log)
                }
            }
            if status == .failed { isFailed = true }
        }
        .alert("次回アラームの再登録に失敗", isPresented: $scheduleFailedAfterCancel) {
            Button("OK") {}
        } message: {
            Text("AlarmKit への再登録が失敗しました。\n設定画面でアラームを再設定してください。")
        }
        .sheet(isPresented: $showEmergencyStop) {
            emergencyStopSheet
        }
    }

    // MARK: - Ringing Content

    private var ringingContent: some View {
        VStack(spacing: 32) {
            Spacer()

            Text("PCカメラにQRコードを見せてください")
                .font(.title3.bold())
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            QRCodeView(content: userId, size: 260)
                .padding(16)
                .background(.white, in: RoundedRectangle(cornerRadius: 16))

            countdownView

            Spacer()

            Button {
                showEmergencyStop = true
            } label: {
                Text("緊急停止（失敗として記録）")
                    .font(.footnote)
                    .foregroundStyle(.red.opacity(0.8))
                    .padding(.vertical, 12)
                    .padding(.horizontal, 24)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.red.opacity(0.6), lineWidth: 1)
                    )
            }
            .padding(.bottom, 40)
        }
    }

    private var countdownView: some View {
        let minutes = secondsRemaining / 60
        let seconds = secondsRemaining % 60
        let progress = Double(secondsRemaining) / Double(maxRingingSeconds)

        return VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.2), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        progress > 0.3 ? Color.orange : Color.red,
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 1), value: secondsRemaining)
                Text(String(format: "%02d:%02d", minutes, seconds))
                    .font(.system(size: 36, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
            }
            .frame(width: 120, height: 120)

            Text("この時間内に解除してください")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.6))
        }
    }

    // MARK: - Overlays

    private var dismissedOverlay: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.green)
            Text("起床確認完了！")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
            Text("お疲れ様です")
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    private var failedOverlay: some View {
        VStack(spacing: 24) {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.red)
            Text("失敗として記録されました")
                .font(.title2.bold())
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Emergency Stop Sheet

    private var emergencyStopSheet: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("緊急停止は「失敗」として記録されます。\n本当に停止しますか？")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)

                SecureField("パスワードを入力", text: $emergencyInput)
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))

                if !emergencyError.isEmpty {
                    Text(emergencyError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Button {
                    verifyEmergencyStop()
                } label: {
                    Text("停止する")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.red, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .disabled(emergencyInput.isEmpty)
            }
            .padding(24)
            .navigationTitle("緊急停止")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") {
                        emergencyInput = ""
                        emergencyError = ""
                        showEmergencyStop = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Actions

    private func verifyEmergencyStop() {
        guard !isHandlingFailure else { return }
        guard hashPassword(emergencyInput, userId: userId) == loadEmergencyPassword(userId: userId) else {
            emergencyError = "パスワードが違います"
            return
        }
        isHandlingFailure = true
        showEmergencyStop = false
        Task { await performFailure() }
    }

    private func performFailure() async {
        do {
            try await firestoreService.markFailed(userId: userId)
            // 現在の鳴動を止め、繰り返し設定があれば次回以降を再登録する
            try? await AlarmService.shared.cancel()
            if let a = alarm, !a.repeatDays.isEmpty {
                do {
                    try await AlarmService.shared.schedule(
                        time: a.time, repeatDays: a.repeatDays, userId: userId
                    )
                } catch {
                    scheduleFailedAfterCancel = true
                }
            }
            let log = WakeLog(
                userId: userId,
                date: todayString(),
                wakeTime: currentTimeString(),
                success: false
            )
            try? await firestoreService.saveWakeLog(log)
        } catch {
            print("[RingingView] markFailed error: \(error)")
        }
        isFailed = true
    }

    private func todayString() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private func currentTimeString() -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: Date())
    }
}
