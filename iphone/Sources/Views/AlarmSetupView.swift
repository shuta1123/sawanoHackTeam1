import SwiftUI

struct AlarmSetupView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService
    @Environment(\.dismiss) private var dismiss

    /// nil = 新規作成、非 nil = 既存アラームの編集
    let editingAlarm: AlarmDocument?

    init(editingAlarm: AlarmDocument? = nil) {
        self.editingAlarm = editingAlarm
    }

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

    private var userId: String { authService.currentUserId ?? "" }
    private var isEditing: Bool { editingAlarm != nil }

    /// 常に保存可能（パスワードは任意）
    private var hasPassword: Bool { true }

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
                        isEditing ? "変更する場合のみ入力" : "緊急停止パスワード",
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
            .navigationTitle(isEditing ? "アラーム編集" : "アラーム追加")
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
                    .disabled(!hasPassword || isSaving)
                }
            }
            .onAppear { loadExisting() }
        }
    }

    // MARK: - Actions

    private func loadExisting() {
        guard let alarm = editingAlarm else { return }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        if let date = formatter.date(from: alarm.time) {
            selectedTime = date
        }
        selectedDays = Set(alarm.repeatDays)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let timeString = formatter.string(from: selectedTime)
        let repeatDays = Array(selectedDays)

        // 入力があれば新規ハッシュ化、なければ Keychain から引き継ぐ（なければスキップ）
        if !emergencyPassword.isEmpty {
            let passwordHash = hashPassword(emergencyPassword, userId: userId)
            saveEmergencyPassword(passwordHash, userId: userId)
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
        // 編集時は既存の id を引き継ぐ（サブコレクション上書き）
        // 新規時は id = nil → Firestore が自動生成
        let alarm = AlarmDocument(
            time: timeString,
            repeatDays: repeatDays,
            status: .scheduled,
            dismissedAt: nil,
            updatedAt: Date()
        )
        // @DocumentID は Codable の外側で管理されるため、editingAlarm.id を手動でコピーできない。
        // saveAlarm 内で editingAlarm.id の有無を確認して書き分ける。
        // ここでは editingAlarm がある場合にそれを渡す。
        let alarmToSave: AlarmDocument
        if var editing = editingAlarm {
            editing.time = timeString
            editing.repeatDays = repeatDays
            editing.status = .scheduled
            editing.dismissedAt = nil
            editing.updatedAt = Date()
            alarmToSave = editing
        } else {
            alarmToSave = alarm
        }

        do {
            try await firestoreService.saveAlarm(alarmToSave, userId: userId)
            dismiss()
        } catch {
            try? await AlarmService.shared.cancel()
            errorMessage = "保存に失敗しました: \(error.localizedDescription)"
        }

        isSaving = false
    }
}
