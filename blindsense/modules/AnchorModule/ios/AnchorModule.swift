import ExpoModulesCore
import ARKit
import simd
import CoreLocation
import UIKit

// MARK: - Heading Manager

class HeadingManager: NSObject, CLLocationManagerDelegate {

  private let locationManager = CLLocationManager()
  var currentHeading: Double = 0.0

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.headingFilter = 1
    locationManager.requestWhenInUseAuthorization()
    locationManager.startUpdatingHeading()
  }

  func locationManager(
    _ manager: CLLocationManager,
    didUpdateHeading newHeading: CLHeading
  ) {
    if newHeading.trueHeading >= 0 {
      currentHeading = newHeading.trueHeading
    } else {
      currentHeading = newHeading.magneticHeading
    }
  }
}

// MARK: - AR Camera View

class ARCameraView: UIView {

  private let arView = ARSCNView(frame: .zero)

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  private func setup() {
    arView.frame = bounds
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(arView)

    // Attach global session
    if let session = AnchorModule.sharedSession {
      arView.session = session
    }
  }
}

// MARK: - Expo Module

public class AnchorModule: Module {

  // 🔹 Global shared session
  static var sharedSession: ARSession?

  private let session = ARSession()
  private var isRunning = false

  private var savedAnchorPosition: SIMD3<Float>? = nil
  private var savedAnchorHeading: Double? = nil

  private let headingManager = HeadingManager()

  public func definition() -> ModuleDefinition {

    Name("AnchorModule")

    // Expose native AR camera view
    View(ARCameraView.self)

    Function("ping") {
      return "AnchorModule alive"
    }

    AsyncFunction("startSession") { () -> Void in
      guard ARWorldTrackingConfiguration.isSupported else {
        throw NSError(domain: "AnchorModule", code: 1)
      }

      let config = ARWorldTrackingConfiguration()
      config.worldAlignment = .gravity

      self.session.run(config, options: [.resetTracking, .removeExistingAnchors])
      self.isRunning = true

      // Store globally so views can access
      AnchorModule.sharedSession = self.session
    }

    AsyncFunction("stopSession") { () -> Void in
      self.session.pause()
      self.isRunning = false
      self.savedAnchorPosition = nil
      self.savedAnchorHeading = nil
    }

    AsyncFunction("saveAnchor") { () -> Void in
      guard
        self.isRunning,
        let frame = self.session.currentFrame
      else {
        throw NSError(domain: "AnchorModule", code: 2)
      }

      let t = frame.camera.transform
      let pos = SIMD3<Float>(
        t.columns.3.x,
        t.columns.3.y,
        t.columns.3.z
      )

      self.savedAnchorPosition = pos
      self.savedAnchorHeading = self.headingManager.currentHeading
    }

    AsyncFunction("getVectorToAnchor") { () -> [String: Any]? in

      guard
        self.isRunning,
        let frame = self.session.currentFrame,
        let anchor = self.savedAnchorPosition,
        let anchorHeading = self.savedAnchorHeading
      else {
        return nil
      }

      let camT = frame.camera.transform
      let camPos = SIMD3<Float>(
        camT.columns.3.x,
        camT.columns.3.y,
        camT.columns.3.z
      )

      let delta = anchor - camPos
      let distance = simd_length(delta)

      let currentHeading = self.headingManager.currentHeading
      let deltaHeading = normalizeAngle(anchorHeading - currentHeading)

      return [
        "dx": Double(delta.x),
        "dy": Double(delta.y),
        "dz": Double(delta.z),
        "distance": Double(distance),
        "currentHeading": currentHeading,
        "anchorHeading": anchorHeading,
        "headingDelta": deltaHeading
      ]
    }
  }

  private func normalizeAngle(_ angle: Double) -> Double {
    var a = angle.truncatingRemainder(dividingBy: 360)
    if a > 180 { a -= 360 }
    if a < -180 { a += 360 }
    return a
  }
}