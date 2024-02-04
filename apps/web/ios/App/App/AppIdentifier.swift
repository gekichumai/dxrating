//
//  AppIdentifier.swift
//  App
//
//  Created by Galvin Gao on 12/20/23.
//

import Foundation

enum AppIdentifier {
    static let assetsAppGroup = "group.dev.imgg.gekichumai.dxrating.public-shared"

    static func of(entityName: String) -> String {
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
        return "\(bundleIdentifier).\(entityName)"
    }
}
