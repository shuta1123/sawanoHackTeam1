import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService

    var body: some View {
        Group {
            if !authService.isLoggedIn {
                LoginView()
            } else {
                HomeView()
                    .onAppear {
                        guard let uid = authService.currentUserId else { return }
                        // fullScreenCover 表示時も onDisappear が呼ばれるため
                        // stopListening はここでは行わず、ログアウト時のみ行う
                        firestoreService.startListening(userId: uid)
                    }
            }
        }
        .animation(.easeInOut, value: authService.currentUserId)
    }
}
