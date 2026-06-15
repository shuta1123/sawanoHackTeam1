import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var firestoreService: FirestoreService

    var body: some View {
        Group {
            if authService.user == nil {
                LoginView()
            } else {
                HomeView()
                    .onAppear {
                        guard let uid = authService.user?.uid else { return }
                        firestoreService.startListening(userId: uid)
                    }
                    .onDisappear {
                        firestoreService.stopListening()
                    }
            }
        }
        .animation(.easeInOut, value: authService.user?.uid)
    }
}
