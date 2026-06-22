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
        // plist が見つからない、読めない、必須キーが欠落/空/REPLACE_ME の場合は
        // UI 確認用に Firebase を無効化して続行する（本番では実際の plist を配置すること）。
        let requiredFirebaseKeys = [
            "API_KEY", "GOOGLE_APP_ID", "PROJECT_ID", "GCM_SENDER_ID", "STORAGE_BUCKET"
        ]
        let firebaseReady: Bool = {
            guard
                let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
                let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
                requiredFirebaseKeys.allSatisfy({
                    guard let value = dict[$0] as? String, !value.isEmpty else { return false }
                    return value != "REPLACE_ME"
                })
            else { return false }
            return true
        }()

        if firebaseReady {
            FirebaseApp.configure()
        } else {
            print("""
            [AlarmStop] ⚠️ GoogleService-Info.plist が未設定のため Firebase を無効化して起動します。
            Firebase Console (https://console.firebase.google.com/) から
            iOS アプリ用の plist を取得し、iphone/Resources/ に配置してください。
            """)
        }
        return true
    }
}
