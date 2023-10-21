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

struct Song: Codable {
    let songId: String
    let title: String
    let imageName: String
    let searchAcronyms: [String]
    let sheets: [Sheet]
}

struct Sheet: Codable {
    let type: String
    let difficulty: String
    let internalLevelValue: Double?
    let version: String?
    
    func formatted() -> String {
        if let internalLevelValue = internalLevelValue {
            return self.difficulty.capitalized + " " + String(internalLevelValue)
        } else {
            return self.difficulty.capitalized + " N/A"
        }
    }
}


struct AppData {
    static func loadDXData() -> DXData? {
        guard let url = Bundle.main.url(forResource: "dxdata", withExtension: "json", subdirectory: "Assets") else {
            print("Failed to locate dxdata.json in the bundle.")
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

}
