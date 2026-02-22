import ExpoModulesCore
import ARKit
import simd
import CoreLocation

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

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    currentHeading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
  }
}

// MARK: - Session Delegate Proxy
// This class handles the Objective-C requirements that AnchorModule cannot
class SessionDelegate: NSObject, ARSessionDelegate {
  var onFrameUpdate: ((ARFrame) -> Void)?

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    onFrameUpdate?(frame)
  }
}

// MARK: - AR Camera View
class ARCameraView: ExpoView {
  let arView = ARSCNView(frame: .zero)

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arView.backgroundColor = .black
    addSubview(arView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    arView.frame = bounds
  }
}

// MARK: - Anchor Module
public class AnchorModule: Module {
  private let session = ARSession()
  private var isRunning = false
  
  // Proxies and Managers
  private let sessionDelegate = SessionDelegate()
  private let headingManager = HeadingManager()
  
  // Anchor Data
  private var savedAnchorPosition: SIMD3<Float>? = nil
  private var savedAnchorHeading: Double? = nil

  // Streaming Data
  private var socketTask: URLSessionWebSocketTask?
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  private let streamQueue = DispatchQueue(label: "com.anchor.streamQueue", qos: .userInteractive)
  
  private var lastStreamTime: CFTimeInterval = 0
  private var streamInterval: CFTimeInterval = 1.0 / 15.0

  public func definition() -> ModuleDefinition {
    Name("AnchorModule")

    View(ARCameraView.self) {
      OnViewDidUpdateProps { view in
        if view.arView.session !== self.session {
          view.arView.session = self.session
        }
      }
    }

    Function("ping") { "AnchorModule alive" }

    AsyncFunction("startSession") { () -> Void in
      guard ARWorldTrackingConfiguration.isSupported else {
        throw NSError(domain: "AnchorModule", code: 1, userInfo: [NSLocalizedDescriptionKey: "ARKit Unsupported"])
      }

      let config = ARWorldTrackingConfiguration()
      config.worldAlignment = .gravity 
      
      // Wire up the delegate proxy
      self.sessionDelegate.onFrameUpdate = { [weak self] frame in
        self?.handleFrame(frame)
      }
      
      self.session.delegate = self.sessionDelegate
      self.session.run(config, options: [.resetTracking, .removeExistingAnchors])
      self.isRunning = true
    }

    AsyncFunction("stopSession") { () -> Void in
      self.session.pause()
      self.isRunning = false
      self.socketTask?.cancel(with: .normalClosure, reason: nil)
      self.socketTask = nil
    }

    AsyncFunction("startStream") { (url: String, fps: Double?) in
      if let requestedFps = fps, requestedFps > 0 {
        self.streamInterval = 1.0 / requestedFps
      }
      
      let urlSession = URLSession(configuration: .default)
      self.socketTask = urlSession.webSocketTask(with: URL(string: url)!)
      self.socketTask?.resume()
    }

    AsyncFunction("stopStream") {
        self.socketTask?.cancel(with: .normalClosure, reason: nil)
        self.socketTask = nil
    }

    AsyncFunction("saveAnchor") { () -> Void in
      guard isRunning, let frame = self.session.currentFrame else { return }
      let t = frame.camera.transform
      self.savedAnchorPosition = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
      self.savedAnchorHeading = self.headingManager.currentHeading
    }

    AsyncFunction("getVectorToAnchor") { () -> [String: Any]? in
      guard isRunning,
            let frame = self.session.currentFrame,
            let anchor = self.savedAnchorPosition,
            let anchorHeading = self.savedAnchorHeading else { return nil }

      let camT = frame.camera.transform
      let camPos = SIMD3<Float>(camT.columns.3.x, camT.columns.3.y, camT.columns.3.z)

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

  // MARK: - Internal Frame Processing
  
  private func handleFrame(_ frame: ARFrame) {
    guard isRunning, let socket = socketTask else { return }

    let currentTime = CACurrentMediaTime()
    if currentTime - lastStreamTime < streamInterval { return }
    lastStreamTime = currentTime

    let pixelBuffer = frame.capturedImage
    
    streamQueue.async { [weak self] in
      guard let self = self else { return }
      
      var ciImage = CIImage(cvPixelBuffer: pixelBuffer)
      ciImage = ciImage.oriented(.right) 

      let colorSpace = CGColorSpaceCreateDeviceRGB()
      let options = [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.4]
      
      if let jpegData = self.ciContext.jpegRepresentation(of: ciImage, colorSpace: colorSpace, options: options) {
        socket.send(.data(jpegData)) { _ in }
      }
    }
  }

  private func normalizeAngle(_ angle: Double) -> Double {
    var a = angle.truncatingRemainder(dividingBy: 360)
    if a > 180 { a -= 360 }
    if a < -180 { a += 360 }
    return a
  }
}