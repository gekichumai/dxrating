//
//  AppPreferences.swift
//  App
//
//  Created by Galvin Gao on 12/13/23.
//

import Foundation

class AppPreferences: ObservableObject {
    @Published var dxVersion: DXVersion = .festivalPlus
    
    static let shared = AppPreferences()
    
    init() {
        let versionString = UserDefaults.standard.string(forKey: "DXVersion") ?? ""
        guard let version = DXVersion(rawValue: versionString) else {
            return
        }
        
        dxVersion = version
    }
    
    func setDXVersion(_ version: DXVersion) {
        dxVersion = version
        UserDefaults.standard.set(version.rawValue, forKey: "DXVersion")
    }
}
