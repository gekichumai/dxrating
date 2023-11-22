//
//  Data.swift
//  App
//
//  Created by Galvin Gao on 10/21/23.
//

import Foundation

struct DXData: Codable {
    let songs: [Song]
}

struct Song: Codable, Identifiable {
    var id: String {
        return songId
    }
    
    let songId: String
    let title: String
    let imageName: String
    let searchAcronyms: [String]
    let sheets: [Sheet]
    
    static func demo() -> Song {
        return .init(
            songId: "LAMIA",
            title: "LAMIA",
            imageName: "88c0e851ff75ea8e94e0bdae0997c54d40876e5614de60768a808a0af590ca9d.png",
            searchAcronyms: [],
            sheets: [
                .init(type: "dx", difficulty: "basic", internalLevelValue: 6, version: "FESTiVAL PLUS"),
                .init(type: "dx", difficulty: "advanced", internalLevelValue: 8, version: "FESTiVAL PLUS"),
                .init(type: "dx", difficulty: "expert", internalLevelValue: 13, version: "FESTiVAL PLUS"),
                .init(type: "dx", difficulty: "master", internalLevelValue: 14.7, version: "FESTiVAL PLUS")
            ]
        )
    }

}

let omitDifficulties: [String] = [
    "basic",
    "advanced"
]

struct Sheet: Codable, Identifiable {
    var id: String {
        return "\(type)-\(difficulty)"
    }
    let type: String
    let difficulty: String
    let internalLevelValue: Double?
    let version: String?
    
    var difficultyWithType: String {
        return "[\((type == "std" ? "sd" : type).uppercased())] \(difficulty)"
    }
    
    func formatted() -> String {
        var sections: [String] = []
        if !omitDifficulties.contains(self.difficulty) {
            sections.append(self.difficulty.capitalized)
        }
        
        if let internalLevelValue = internalLevelValue {
            sections.append(String(internalLevelValue))
        } else {
            sections.append("N/A")
        }
        
        return sections.joined(separator: " ")
    }
}

struct AppData {
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
