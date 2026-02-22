import ExpoModulesCore
import ARKit
import simd
import CoreLocation
import AVFoundation // 🔹 Added for volume tracking

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
  private let sessionDelegate = SessionDelegate()
  private let headingManager = HeadingManager()
  
  private var savedAnchorPosition: SIMD3<Float>? = nil
  private var savedAnchorHeading: Double? = nil

  private var apiURL: URL?
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  private let streamQueue = DispatchQueue(label: "com.anchor.streamQueue", qos: .userInteractive)
  
  private var lastStreamTime: CFTimeInterval = 0
  private var streamInterval: CFTimeInterval = 1.0 

  private var raycastTimer: DispatchSourceTimer?
  private var hasStartedRaycasting = false

  // 🔹 Added for Physical Button Tracking
  private var volumeObservation: NSKeyValueObservation?

  public func definition() -> ModuleDefinition {
    Name("AnchorModule")

    // 🔹 Added "onVolumeButtonPress" to the Events list
    Events("raycastUpdate", "onObjectsDetected", "onStreamStatus", "onVolumeButtonPress")

    View(ARCameraView.self) {
      OnViewDidUpdateProps { view in
        if view.arView.session !== self.session {
          view.arView.session = self.session
        }
      }
    }

    Function("ping") { "AnchorModule alive" }

    // 🔹 NEW: Exposing Volume Tracking to TSX
    AsyncFunction("activateVolumeTracker") {
      let audioSession = AVAudioSession.sharedInstance()
      
      // Setup session to allow observation
      try? audioSession.setCategory(.ambient, options: .mixWithOthers)
      try? audioSession.setActive(true)

      // Observe the outputVolume property
      self.volumeObservation = audioSession.observe(\.outputVolume, options: [.old, .new]) { [weak self] (session, change) in
        guard let self = self, 
              let oldVal = change.oldValue, 
              let newVal = change.newValue else { return }

        let direction = newVal > oldVal ? "UP" : "DOWN"
        
        // This will log in the terminal via Xcode/Console and send to TSX
        print("🔊 Physical Button: \(direction) | Volume: \(newVal)")
        
        self.sendEvent("onVolumeButtonPress", [
          "direction": direction,
          "volume": newVal
        ])
      }
    }

    AsyncFunction("startSession") { () -> Void in
      let config = ARWorldTrackingConfiguration()
      config.worldAlignment = .gravity
      if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
        config.frameSemantics.insert(.sceneDepth)
      }
      self.sessionDelegate.onFrameUpdate = { [weak self] frame in
        self?.handleFrame(frame)
      }
      self.session.delegate = self.sessionDelegate
      self.session.run(config, options: [.resetTracking, .removeExistingAnchors])
      self.isRunning = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
        self.startCenterRaycasting()
      }
    }

    AsyncFunction("stopSession") { () -> Void in
      self.session.pause()
      self.isRunning = false
      self.stopCenterRaycasting()
      self.volumeObservation?.invalidate() // Clean up observer
    }

    AsyncFunction("startStream") { (url: String, fps: Double?) in
      print("🌐 Setting API URL to: \(url)")
      self.apiURL = URL(string: url)
      if let requestedFps = fps, requestedFps > 0 {
        self.streamInterval = 1.0 / requestedFps
      } else {
        self.streamInterval = 1
      }
    }

    AsyncFunction("stopStream") {
      self.apiURL = nil
    }

    AsyncFunction("saveAnchor") { () -> Void in
      guard isRunning, let frame = self.session.currentFrame else { return }
      let t = frame.camera.transform
      self.savedAnchorPosition = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
      self.savedAnchorHeading = self.headingManager.currentHeading
    }

    AsyncFunction("getVectorToAnchor") { () -> [String: Any]? in
      guard isRunning, let frame = self.session.currentFrame, let anchorPos = self.savedAnchorPosition, let anchorHeading = self.savedAnchorHeading else { return nil }
      let cameraTransform = frame.camera.transform
      let camWorldPos = SIMD3<Float>(cameraTransform.columns.3.x, cameraTransform.columns.3.y, cameraTransform.columns.3.z)
      let worldDelta = anchorPos - camWorldPos
      let distance = simd_length(worldDelta)
      let rotationMatrix = simd_float3x3(
        SIMD3<Float>(cameraTransform.columns.0.x, cameraTransform.columns.0.y, cameraTransform.columns.0.z),
        SIMD3<Float>(cameraTransform.columns.1.x, cameraTransform.columns.1.y, cameraTransform.columns.1.z),
        SIMD3<Float>(cameraTransform.columns.2.x, cameraTransform.columns.2.y, cameraTransform.columns.2.z)
      )
      let localDelta = rotationMatrix.transpose * worldDelta
      var instruction = "STAY"
      if distance > 0.6 { instruction = localDelta.z < 0 ? "FORWARD" : "BACKWARD" }
      else {
        let headingError = normalizeAngle(anchorHeading - self.headingManager.currentHeading)
        instruction = abs(headingError) < 15.0 ? "ARRIVED_AND_ALIGNED" : (headingError > 0 ? "LOOK_RIGHT" : "LOOK_LEFT")
      }
      return ["distance": Double(distance), "instruction": instruction]
    }
  }

  // MARK: - 🔹 HTTP INTEGRATION: FRAME PROCESSING & UPLOAD
  private func handleFrame(_ frame: ARFrame) {
    guard isRunning, let url = apiURL else { return }

    let currentTime = CACurrentMediaTime()
    if currentTime - lastStreamTime < streamInterval { return }
    lastStreamTime = currentTime

    self.sendEvent("onStreamStatus", ["status": "Capturing..."])

    let pixelBuffer = frame.capturedImage
    streamQueue.async { [weak self] in
      guard let self = self else { return }
      
      let ciImage = CIImage(cvPixelBuffer: pixelBuffer).oriented(.right)
      let scale = 640.0 / ciImage.extent.width
      let scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      
      guard let jpegData = self.ciContext.jpegRepresentation(of: scaledImage, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [:]) else { return }

      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      let boundary = "Boundary-\(UUID().uuidString)"
      request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

      var body = Data()
      body.append("--\(boundary)\r\n".data(using: .utf8)!)
      body.append("Content-Disposition: form-data; name=\"image\"; filename=\"frame.jpg\"\r\n".data(using: .utf8)!)
      body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
      body.append(jpegData)
      body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
      request.httpBody = body

      self.sendEvent("onStreamStatus", ["status": "Uploading..."])

      URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
          self.sendEvent("onStreamStatus", ["status": "❌ HTTP Error: \(error.localizedDescription)"])
          return
        }
        guard let data = data else { return }
        self.sendEvent("onStreamStatus", ["status": "✅ Received Response"])
        self.processApiResponse(data, currentFrame: frame)
      }.resume()
    }
  }

  // MARK: - 🔹 HTTP INTEGRATION: LIDAR LOOKUP
  private func processApiResponse(_ jsonData: Data, currentFrame: ARFrame) {
    guard let root = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
          let detections = root["detections"] as? [[String: Any]],
          let depthData = currentFrame.sceneDepth else { return }

    let depthMap = depthData.depthMap
    CVPixelBufferLockBaseAddress(depthMap, .readOnly)
    let width = CVPixelBufferGetWidth(depthMap)
    let height = CVPixelBufferGetHeight(depthMap)
    let floatBuffer = CVPixelBufferGetBaseAddress(depthMap)?.assumingMemoryBound(to: Float32.self)
    let format = currentFrame.displayTransform(for: .portrait, viewportSize: CGSize(width: 1, height: 1)).inverted()

    var processedObjects: [[String: Any]] = []

    for det in detections {
      let normX = det["x"] as? Double ?? 0.5
      let normY = det["y"] as? Double ?? 0.5
      let label = det["label"] as? String ?? "object"

      let bufferPoint = CGPoint(x: normX, y: normY).applying(format)
      let x = Int(bufferPoint.x * CGFloat(width))
      let y = Int(bufferPoint.y * CGFloat(height))

      var distance: Double = -1.0
      if x >= 0 && x < width && y >= 0 && y < height {
        distance = Double(floatBuffer?[y * width + x] ?? -1.0)
      }

      processedObjects.append([
        "label": label,
        "distance": distance,
        "x": normX,
        "y": normY
      ])
    }
    CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
    self.sendEvent("onObjectsDetected", ["objects": processedObjects])
  }

  private func getLiDARCenterDistance() -> [String: Any]? {
    guard let frame = session.currentFrame, let depthData = frame.sceneDepth else { return nil }
    let depthMap = depthData.depthMap
    CVPixelBufferLockBaseAddress(depthMap, .readOnly)
    let width = CVPixelBufferGetWidth(depthMap)
    let height = CVPixelBufferGetHeight(depthMap)
    let screenCenter = CGPoint(x: 0.5, y: 0.5)
    let format = frame.displayTransform(for: .portrait, viewportSize: CGSize(width: 1, height: 1)).inverted()
    let normalizedPoint = screenCenter.applying(format)
    let x = Int(normalizedPoint.x * CGFloat(width))
    let y = Int(normalizedPoint.y * CGFloat(height))
    if x >= 0 && x < width && y >= 0 && y < height {
      let baseAddress = CVPixelBufferGetBaseAddress(depthMap)
      let floatBuffer = baseAddress?.assumingMemoryBound(to: Float32.self)
      let distance = floatBuffer?[y * width + x] ?? 0
      CVPixelBufferUnlockBaseAddress(depthMap, .readOnly)
      if distance > 0 && distance < 5.0 { return ["distance": Double(distance), "status": "lidar_aligned"] }
    } else { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
    return nil
  }
 
  private func startCenterRaycasting() {
    guard !hasStartedRaycasting else { return }
    hasStartedRaycasting = true
    raycastTimer?.cancel()
    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
    timer.schedule(deadline: .now(), repeating: 0.1)
    timer.setEventHandler { [weak self] in
      if let data = self?.getLiDARCenterDistance() { self?.sendEvent("raycastUpdate", data) }
    }
    raycastTimer = timer
    timer.resume()
  }

  private func stopCenterRaycasting() {
    raycastTimer?.cancel()
    raycastTimer = nil
    hasStartedRaycasting = false
  }

  private func normalizeAngle(_ angle: Double) -> Double {
    var a = angle.truncatingRemainder(dividingBy: 360); if a > 180 { a -= 360 }; if a < -180 { a += 360 }; return a
  }
}