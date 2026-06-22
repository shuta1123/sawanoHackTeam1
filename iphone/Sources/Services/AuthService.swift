import Foundation
import FirebaseAuth
import FirebaseCore
import Combine

@MainActor
final class AuthService: ObservableObject {
    @Published var user: User?
    /// Firebase 未設定時のデバッグ用擬似ユーザーID
    @Published var debugUserId: String?
    @Published var errorMessage: String?

    /// ログイン済みとみなせる userId（本番 or デバッグ）
    var currentUserId: String? { user?.uid ?? debugUserId }
    var isLoggedIn: Bool { currentUserId != nil }

    // デバッグ用アカウント (Firebase 未設定時のみ有効)
    private let debugEmail    = "debug@alarmstop.local"
    private let debugPassword = "debug1234"

    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        guard FirebaseApp.app() != nil else {
            print("[AuthService] Firebase 未設定のため認証機能を無効化します。")
            return
        }
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.user = user
            }
        }
    }

    deinit {
        if let handle { Auth.auth().removeStateDidChangeListener(handle) }
    }

    func signIn(email: String, password: String) async {
        errorMessage = nil
        if FirebaseApp.app() == nil {
            // デバッグモード: 固定アカウントのみ許可
            if email == debugEmail && password == debugPassword {
                debugUserId = "debug-user-local"
            } else {
                errorMessage = "デバッグ用: \(debugEmail) / \(debugPassword) でログインしてください"
            }
            return
        }
        do {
            try await Auth.auth().signIn(withEmail: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createAccount(email: String, password: String) async {
        errorMessage = nil
        guard FirebaseApp.app() != nil else {
            errorMessage = "Firebase 未設定のためアカウント作成できません。デバッグ用アカウントでログインしてください。"
            return
        }
        do {
            try await Auth.auth().createUser(withEmail: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        debugUserId = nil
        guard FirebaseApp.app() != nil else { return }
        try? Auth.auth().signOut()
    }
}
