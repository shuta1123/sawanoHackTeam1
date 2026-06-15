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
        // GoogleService-Info.plist がプレースホルダーのままだと Firebase 初期化が無意味に失敗する。
        // 必須キー全体を確認し、1つでも REPLACE_ME が残っていたら明確なエラーで止める。
        let requiredFirebaseKeys = [
            "API_KEY", "GOOGLE_APP_ID", "PROJECT_ID", "GCM_SENDER_ID", "STORAGE_BUCKET"
        ]
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
           requiredFirebaseKeys.contains(where: { dict[$0] as? String == "REPLACE_ME" }) {
            fatalError("""
            [AlarmStop] GoogleService-Info.plist がプレースホルダーのままです。
            Firebase Console (https://console.firebase.google.com/) から
            iOS アプリ用の plist を取得し、iphone/Resources/ に配置してください。
            """)
        }
        FirebaseApp.configure()
        return true
    }
}
