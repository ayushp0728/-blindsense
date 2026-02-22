import AVFoundation
import MediaPlayer
import UIKit

final class VolumeButtonManager: NSObject {
    private let audioSession = AVAudioSession.sharedInstance()
    private var observation: NSKeyValueObservation?
    
    // We need to keep a reference to this so the system actually hides the HUD
    private let volumeView = MPVolumeView(frame: CGRect(x: -100, y: -100, width: 1, height: 1))
    
    // The "Sweet Spot" volume to prevent the system HUD from appearing
    private let targetVolume: Float = 0.5 

    var onVolumePressed: (() -> Void)?

    override init() {
        super.init()
        setupAudioSession()
        hideSystemVolumeHUD()
        startObserving()
    }

    private func setupAudioSession() {
        do {
            // .playback or .playAndRecord is required to receive volume events
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers])
            try audioSession.setActive(true)
        } catch {
            print("Audio session setup failed: \(error)")
        }
    }

    private func hideSystemVolumeHUD() {
        // To hide the native volume UI, the MPVolumeView must be in the view hierarchy.
        // In an Expo module, you might need to attach this to the root view controller.
        DispatchQueue.main.async {
            if let window = UIApplication.shared.windows.first {
                self.volumeView.clipsToBounds = true
                self.volumeView.alpha = 0.001 // Nearly invisible but active
                window.addSubview(self.volumeView)
            }
        }
    }

    private func startObserving() {
        // Reset to middle so user has room to click up or down
        setSystemVolume(targetVolume)
        
        observation = audioSession.observe(\.outputVolume, options: [.new]) { [weak self] _, change in
            guard let self = self, let newVolume = change.newValue else { return }

            // Trigger the action
            self.onVolumePressed?()

            // Reset volume immediately to allow for the next click
            // Use a slight delay to avoid KVO feedback loops
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.setSystemVolume(self.targetVolume)
            }
        }
    }

    private func setSystemVolume(_ volume: Float) {
        // MPVolumeView slider is the only reliable way to programmatically set volume 
        // without the system showing the large volume HUD.
        DispatchQueue.main.async {
            let slider = self.volumeView.subviews.first(where: { $0 is UISlider }) as? UISlider
            slider?.value = volume
        }
    }
    
    deinit {
        observation?.invalidate()
        observation = nil
    
        DispatchQueue.main.async { [volumeView] in
            volumeView.removeFromSuperview()
        }
    }


}
