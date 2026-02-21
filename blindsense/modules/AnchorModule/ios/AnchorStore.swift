import Foundation
import simd

class AnchorStore {
  static let shared = AnchorStore()
  var anchorPosition: SIMD3<Float>?
}