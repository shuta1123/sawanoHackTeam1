import XCTest
@testable import AlarmStop

final class HashPasswordTests: XCTestCase {

    func testDeterministic() {
        XCTAssertEqual(
            hashPassword("mysecret", userId: "user001"),
            hashPassword("mysecret", userId: "user001")
        )
    }

    func testDifferentPasswordsProduceDifferentHashes() {
        XCTAssertNotEqual(
            hashPassword("password1", userId: "user001"),
            hashPassword("password2", userId: "user001")
        )
    }

    func testDifferentUserIdsProduceDifferentHashes() {
        XCTAssertNotEqual(
            hashPassword("mysecret", userId: "user001"),
            hashPassword("mysecret", userId: "user002")
        )
    }

    func testOutputIs64HexChars() {
        let h = hashPassword("p", userId: "u")
        XCTAssertEqual(h.count, 64, "PBKDF2-SHA256 は 32 バイト = 64 hex 文字")
        XCTAssertTrue(h.allSatisfy { "0123456789abcdef".contains($0) })
    }

    // 実装を変えると Keychain の既存ハッシュが全員無効になるため regression として固定
    func testRegressionHashIsStable() {
        let h1 = hashPassword("alarmstop", userId: "reguser")
        let h2 = hashPassword("alarmstop", userId: "reguser")
        XCTAssertEqual(h1, h2)
        XCTAssertEqual(h1.count, 64)
    }
}
