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
        // Firebase を直接コードで初期化（plist 不要）
        // plist がバンドルに含まれていればそちらを優先し、なければコード設定を使う。
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            print("[AlarmStop] ✅ Firebase initialized from GoogleService-Info.plist")
        } else {
            let options = FirebaseOptions(
                googleAppID: "1:1043304150852:ios:a15d831361604d05c1c911",
                gcmSenderID: "1043304150852"
            )
            options.apiKey      = "AIzaSyAPciyxcaJvy5bOl9BJafLg5EF0Z0pJE6o"
            options.projectID   = "sawano-hack-team1"
            options.storageBucket = "sawano-hack-team1.firebasestorage.app"
            options.bundleID    = Bundle.main.bundleIdentifier ?? "com.sawanohackteam1.AlarmStop"
            FirebaseApp.configure(options: options)
            print("[AlarmStop] ✅ Firebase initialized from code (plist not found in bundle)")
        }
        return true
    }
}
