//
//  DXRatingPlugin.swift
//  App
//
//  Created by Galvin Gao on 12/13/23.
//

import Foundation
import Capacitor

enum DXVersion: String {
    case festivalPlus = "festival-plus"
    case buddies = "buddies"
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
}
