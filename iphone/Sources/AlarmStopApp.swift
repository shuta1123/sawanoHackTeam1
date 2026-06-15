import SwiftUI
import Firebase

@main
struct AlarmStopApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authService = AuthService()
    @StateObject private var firestoreService = FirestoreService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(firestoreService)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // plist が見つからない、読めない、必須キーが欠落/空/REPLACE_ME のいずれでも早期 fatalError。
        let requiredFirebaseKeys = [
            "API_KEY", "GOOGLE_APP_ID", "PROJECT_ID", "GCM_SENDER_ID", "STORAGE_BUCKET"
        ]
        guard
            let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
            let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
            requiredFirebaseKeys.allSatisfy({
                guard let value = dict[$0] as? String, !value.isEmpty else { return false }
                return value != "REPLACE_ME"
            })
        else {
            fatalError("""
            [AlarmStop] GoogleService-Info.plist が未設定または不正です。
            Firebase Console (https://console.firebase.google.com/) から
            iOS アプリ用の plist を取得し、iphone/Resources/ に配置してください。
            (必須キー: \(requiredFirebaseKeys.joined(separator: ", ")))
            """)
        }
        FirebaseApp.configure()
        return true
    }
}
