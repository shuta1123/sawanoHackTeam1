import AVFoundation

/// サイレントモードでも鳴るアラーム音プレイヤー。
/// AVAudioEngine でサイン波を生成するためバンドル音声ファイル不要。
final class AlarmAudioPlayer {
    static let shared = AlarmAudioPlayer()
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var isRunning = false

    private init() {}

    func start() {
        guard !isRunning else { return }

        // .playback カテゴリで サイレントスイッチを無視して再生
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)

        engine.attach(player)
        let mixer = engine.mainMixerNode
        let format = mixer.outputFormat(forBus: 0)
        engine.connect(player, to: mixer, format: format)

        guard let buffer = makeBeepBuffer(format: format) else { return }

        do {
            try engine.start()
        } catch {
            print("[AlarmAudioPlayer] engine start error: \(error)")
            return
        }

        player.scheduleBuffer(buffer, at: nil, options: .loops)
        player.play()
        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        player.stop()
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isRunning = false
    }

    // MARK: - Private

    /// 880Hz ビープ音（0.6秒ON + 0.4秒OFF）の1サイクルバッファを生成
    private func makeBeepBuffer(format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let sampleRate = format.sampleRate
        let cycleFrames = AVAudioFrameCount(sampleRate * 1.0) // 1秒/サイクル
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: cycleFrames) else { return nil }
        buffer.frameLength = cycleFrames

        let onFrames = Int(sampleRate * 0.6)
        let channels = Int(format.channelCount)
        guard let data = buffer.floatChannelData else { return nil }

        for frame in 0..<Int(cycleFrames) {
            let t = Double(frame) / sampleRate
            // ON区間: サイン波、OFF区間: 無音
            let sample: Float = frame < onFrames
                ? Float(sin(2.0 * .pi * 880.0 * t) * 0.85)
                : 0.0
            for ch in 0..<channels {
                data[ch][frame] = sample
            }
        }
        return buffer
    }
}
