import ExpoModulesCore
import UIKit

public class DynamicAppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DynamicAppIcon")

    AsyncFunction("setAppIcon") { (iconName: String, promise: Promise) in
      guard UIApplication.shared.supportsAlternateIcons else {
        promise.reject("UNSUPPORTED", "Alternate icons are not supported on this device")
        return
      }

      let alternateIconName = iconName == "light" ? "LightIcon" : nil

      UIApplication.shared.setAlternateIconName(alternateIconName) { error in
        if let error = error {
          promise.reject("ICON_CHANGE_ERROR", error.localizedDescription)
        } else {
          promise.resolve()
        }
      }
    }
  }
}
