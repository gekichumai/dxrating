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
