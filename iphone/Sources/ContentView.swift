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
                        firestoreService.startListening(userId: uid)
                    }
                    .onDisappear {
                        firestoreService.stopListening()
                    }
            }
        }
        .animation(.easeInOut, value: authService.currentUserId)
    }
}
