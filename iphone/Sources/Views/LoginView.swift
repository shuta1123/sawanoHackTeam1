import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authService: AuthService

    @State private var email = ""
    @State private var password = ""
    @State private var isCreatingAccount = false
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                Spacer()

                // Logo
                VStack(spacing: 8) {
                    Image(systemName: "alarm.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.orange)
                    Text("AlarmStop")
                        .font(.largeTitle.bold())
                    Text("QRコードで起床を証明する目覚まし")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Form
                VStack(spacing: 16) {
                    TextField("メールアドレス", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))

                    SecureField("パスワード", text: $password)
                        .textContentType(isCreatingAccount ? .newPassword : .password)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))

                    if let error = authService.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task {
                            isLoading = true
                            authService.errorMessage = nil
                            if isCreatingAccount {
                                await authService.createAccount(email: email, password: password)
                            } else {
                                await authService.signIn(email: email, password: password)
                            }
                            isLoading = false
                        }
                    } label: {
                        Group {
                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text(isCreatingAccount ? "アカウント作成" : "ログイン")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.orange, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                    }
                    .disabled(email.isEmpty || password.isEmpty || isLoading)
                }

                Button {
                    isCreatingAccount.toggle()
                    authService.errorMessage = nil
                } label: {
                    Text(isCreatingAccount
                         ? "アカウントをお持ちの方はこちら"
                         : "新規アカウント作成")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }

                // デバッグ用: Firebase 未設定時のみ表示
                #if DEBUG
                if authService.debugUserId == nil {
                    Button {
                        Task { await authService.signIn(email: "debug@alarmstop.local", password: "debug1234") }
                    } label: {
                        Text("🛠 デバッグログイン")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 4)
                    }
                }
                #endif

                Spacer()
            }
            .padding(.horizontal, 24)
            .navigationBarHidden(true)
        }
    }
}
