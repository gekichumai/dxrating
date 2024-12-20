//
//  AppData.swift
//  App
//
//  Created by Galvin Gao on 12/19/23.
//

import Foundation

class CachedAppData {
    static let shared = CachedAppData()

    private var dxData: DXData?
    private var dxDataSHA256Sum: String?

    private init() {
        dxData = AppData.loadDXData()
        dxDataSHA256Sum = AppData.calculateDXDataSha256()
    }

    func getDXData() -> DXData? {
        return dxData
    }

    func getDXDataSHA256Sum() -> String? {
        return dxDataSHA256Sum
    }

    func update() {
        dxData = AppData.loadDXData()
        dxDataSHA256Sum = AppData.calculateDXDataSha256()
    }
}

enum AppData {
    static func getDXDataJsonURL() -> URL? {
        var bundle = Bundle.main
        if bundle.bundleURL.pathExtension == "appex" {
            // Peel off two directory levels - MY_APP.app/PlugIns/MY_APP_EXTENSION.appex
            let url = bundle.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
            if let otherBundle = Bundle(url: url) {
                bundle = otherBundle
            }
        }

        guard let url = bundle.url(forResource: "dxdata", withExtension: "json", subdirectory: "Assets") else {
            print("Failed to locate dxdata.json in the bundle.")
            return nil
        }

        return url
    }

    static func loadDXData() -> DXData? {
        guard let url = getDXDataJsonURL() else {
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            let dxData = try decoder.decode(DXData.self, from: data)

            return dxData
        } catch {
            print("An error occurred: \(error)")
            return nil
        }
    }

    static func calculateDXDataSha256() -> String? {
        guard let url = getDXDataJsonURL() else {
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            return data.sha256()
        } catch {
            print("An error occurred: \(error)")
            return nil
        }
    }
}
