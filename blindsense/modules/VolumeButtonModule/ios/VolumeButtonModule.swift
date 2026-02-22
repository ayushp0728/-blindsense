import ExpoModulesCore
 
public class VolumeButtonModule: Module {
  private let manager = VolumeButtonManager()
 
  public func definition() -> ModuleDefinition {
    Name("VolumeButtonModule")
 
    Events("volumePressed")
 
    OnCreate {
      self.manager.onVolumePressed = { [weak self] in
        self?.sendEvent("volumePressed")
      }
    }
  }
}
