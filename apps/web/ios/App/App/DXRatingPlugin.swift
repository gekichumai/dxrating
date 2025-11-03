//
//  DXRatingPlugin.swift
//  App
//
//  Created by Galvin Gao on 12/13/23.
//

import Capacitor
import Foundation

enum DXVersion: String {
  case festivalPlus = "festival-plus"
  case buddies
  case buddiesPlus = "buddies-plus"
  case prism
  case prismPlus = "prism-plus"
  case circle
}

extension DXVersion {
  var theme: String {
    switch self {
    case .festivalPlus:
      return "festival-plus"
    case .buddies:
      fallthrough
    case .buddiesPlus:
      return "buddies"
    case .prism:
      fallthrough
    case .prismPlus:
      return "prism"
    case .circle:
      return "circle"
    default:
      return "prism"
    }
  }
}

@objc(DXRatingPlugin)
public class DXRatingPlugin: CAPPlugin {
  @objc func userPreferenceDidChanged(_ call: CAPPluginCall) {
    let versionString = call.getString("version") ?? ""
    print("received userPreferenceDidChanged \(versionString)")

    guard let version = DXVersion(rawValue: versionString) else {
      call.reject("Invalid version")
      return
    }

    AppPreferences.shared.setDXVersion(version)

    return call.resolve()
  }

  @objc func launchInstantOCR(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      let vc = InstantOCRViewController()
      self.bridge?.viewController?.present(vc, animated: true)
    }

    return call.resolve()
  }
}
