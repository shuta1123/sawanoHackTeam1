import SwiftUI

struct AlarmSetupView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService
    @Environment(\.dismiss) private var dismiss

    @State private var selectedTime: Date = {
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comps.hour = 7
        comps.minute = 0
        return Calendar.current.date(from: comps) ?? Date()
    }()
    @State private var selectedDays: Set<String> = ["mon", "tue", "wed", "thu", "fri"]
    @State private var emergencyPassword = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var userId: String { authService.user?.uid ?? "" }

    /// 新規入力または既存ハッシュのどちらかがあれば保存可能
    private var hasPassword: Bool {
        !emergencyPassword.isEmpty || !(firestoreService.alarm?.emergencyPassword.isEmpty ?? true)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("起床時刻") {
                    DatePicker(
                        "時刻",
                        selection: $selectedTime,
                        displayedComponents: .hourAndMinute
                    )
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .center)
                }

                Section("繰り返し") {
                    HStack(spacing: 8) {
                        ForEach(RepeatDay.all) { day in
                            Button {
                                if selectedDays.contains(day.id) {
                                    selectedDays.remove(day.id)
                                } else {
                                    selectedDays.insert(day.id)
                                }
                            } label: {
                                Text(day.label)
                                    .font(.callout.bold())
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                                    .background(
                                        selectedDays.contains(day.id)
                                            ? Color.orange
                                            : Color.secondary.opacity(0.15),
                                        in: RoundedRectangle(cornerRadius: 8)
                                    )
                                    .foregroundStyle(
                                        selectedDays.contains(day.id) ? .white : .primary
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    SecureField(
                        firestoreService.alarm != nil ? "変更する場合のみ入力" : "緊急停止パスワード",
                        text: $emergencyPassword
                    )
                    .textContentType(.newPassword)
                } header: {
                    Text("緊急停止パスワード")
                } footer: {
                    Text("QRコードで解除できない場合のみ使用。入力すると失敗として記録されます。")
                        .font(.caption)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("アラーム設定")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView().tint(.orange)
                        } else {
                            Text("保存").bold()
                        }
                    }
                    .disabled(!hasPassword || selectedDays.isEmpty || isSaving)
                }
            }
            .onAppear { loadExisting() }
        }
    }

    // MARK: - Actions

    private func loadExisting() {
        guard let alarm = firestoreService.alarm else { return }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        if let date = formatter.date(from: alarm.time) {
            selectedTime = date
        }
        selectedDays = Set(alarm.repeatDays)
        // emergencyPassword はハッシュ化済みのため表示しない（再入力時のみ上書き）
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let timeString = formatter.string(from: selectedTime)
        let repeatDays = Array(selectedDays)

        // 入力があれば新規ハッシュ化、なければ既存ハッシュを引き継ぐ
        let passwordHash: String
        if !emergencyPassword.isEmpty {
            passwordHash = hashPassword(emergencyPassword)
        } else if let existing = firestoreService.alarm?.emergencyPassword, !existing.isEmpty {
            passwordHash = existing
        } else {
            errorMessage = "パスワードを入力してください"
            isSaving = false
            return
        }

        // 1. AlarmKit を先にスケジュール（失敗したら Firestore に書かない）
        do {
            try await AlarmService.shared.schedule(
                time: timeString,
                repeatDays: repeatDays,
                userId: userId
            )
        } catch {
            errorMessage = "アラームのスケジュールに失敗しました: \(error.localizedDescription)"
            isSaving = false
            return
        }

        // 2. Firestore に保存
        let alarm = AlarmDocument(
            time: timeString,
            repeatDays: repeatDays,
            status: .scheduled,
            dismissedAt: nil,
            updatedAt: Date(),
            emergencyPassword: passwordHash
        )

        do {
            try await firestoreService.saveAlarm(alarm, userId: userId)
            dismiss()
        } catch {
            // Firestore 失敗時は AlarmKit もロールバック
            try? await AlarmService.shared.cancel()
            errorMessage = "保存に失敗しました: \(error.localizedDescription)"
        }

        isSaving = false
    }
}
