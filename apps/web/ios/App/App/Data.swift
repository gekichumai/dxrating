//
//  Data.swift
//  App
//
//  Created by Galvin Gao on 10/21/23.
//

import Foundation
import UIKit

struct DXData: Codable {
    let songs: [Song]
}

struct Regions: Codable, Equatable, Sendable {
    let jp, intl, cn: Bool
}

enum TypeEnum: String, Codable, Equatable, Sendable {
    case dx = "dx"
    case std = "std"
    case utage = "utage"
    case utage2P = "utage2p"
}

enum VersionEnum: String, Codable, Equatable, Sendable {
    case buddies = "BUDDiES"
    case festival = "FESTiVAL"
    case festivalplus = "FESTiVAL PLUS"
    case finale = "FiNALE"
    case green = "GreeN"
    case greenplus = "GreeN PLUS"
    case maimai = "maimai"
    case maimaiplus = "maimai PLUS"
    case maimaidx = "maimaiでらっくす"
    case maimaidxplus = "maimaiでらっくす PLUS"
    case milk = "MiLK"
    case milkplus = "MiLK PLUS"
    case murasaki = "MURASAKi"
    case murasakiplus = "MURASAKi PLUS"
    case orange = "ORANGE"
    case orangeplus = "ORANGE PLUS"
    case pink = "PiNK"
    case pinkplus = "PiNK PLUS"
    case splash = "Splash"
    case splashplus = "Splash PLUS"
    case universe = "UNiVERSE"
    case universeplus = "UNiVERSE PLUS"
}

enum CategoryEnum: String, Codable, Equatable, Sendable {
    case maimai = "maimai"
    case niconicovocaloid = "niconico＆ボーカロイド"
    case popsanime = "POPS＆アニメ"
    case ongekichunithm = "オンゲキ＆CHUNITHM"
    case gamevariety = "ゲーム＆バラエティ"
    case otoge = "宴会場"
    case touhouproject = "東方Project"
}

struct NoteCounts: Codable, Equatable, Sendable {
    let tap, hold, slide, touch: Int?
    let noteCountsBreak, total: Int?

    enum CodingKeys: String, CodingKey {
        case tap, hold, slide, touch
        case noteCountsBreak = "break"
        case total
    }
}

struct Song: Codable, Identifiable {
    var id: String {
        return songID
    }
    
    let songID: String
    let category: CategoryEnum
    let title, artist: String
    let bpm: Int?
    let imageName: String
    let version: VersionEnum
    let releaseDate: String
    let isNew, isLocked: Bool
    let sheets: [Sheet]
    let searchAcronyms: [String]

    enum CodingKeys: String, CodingKey {
        case songID = "songId"
        case category, title, artist, bpm, imageName, version, releaseDate, isNew, isLocked, sheets, searchAcronyms
    }
    
    var coverImage: UIImage? {
        let coversDir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.dev.imgg.gekichumai.dxrating.public-shared")?.appendingPathComponent("Covers")
        
        let resource = self.imageName
        guard let imageUrl = coversDir?.appendingPathComponent(resource) else {
            return nil
        }
        
        let imageData = try? Data(contentsOf: imageUrl)
        let uiImage = (imageData != nil) ? UIImage(data: imageData!) : nil
        
        return uiImage
    }
    
    #if DEBUG
    static func demo() -> Song {
        return .init(
            songID: "raputa",
            category: .maimai,
            title: "raputa",
            artist: "sasakure.UK × TJ.hangneil",
            bpm: 339,
            imageName: "7a1e5ffd34a526f8fe79f16e7435fc57da813aa53f0b5d773e34fce202122651.png",
            version: .buddies,
            releaseDate: "2023-12-09",
            isNew: true,
            isLocked: true,
            sheets: [
                .init(
                    type: .dx,
                    difficulty: "basic",
                    level: "7",
                    internalLevelValue: 7,
                    noteDesigner: "-",
                    noteCounts: .init(tap: nil, hold: nil, slide: nil, touch: nil, noteCountsBreak: nil, total: nil),
                    regions: .init(jp: true, intl: false, cn: false),
                    isSpecial: false,
                    version: .buddies,
                    multiverInternalLevelValue: nil,
                    comment: nil,
                    internalID: nil
                ),
                .init(
                    type: .dx,
                    difficulty: "advanced",
                    level: "8+",
                    internalLevelValue: 8.7,
                    noteDesigner: "-",
                    noteCounts: .init(tap: nil, hold: nil, slide: nil, touch: nil, noteCountsBreak: nil, total: nil),
                    regions: .init(jp: true, intl: false, cn: false),
                    isSpecial: false,
                    version: .buddies,
                    multiverInternalLevelValue: nil,
                    comment: nil,
                    internalID: nil
                ),
                .init(
                    type: .dx,
                    difficulty: "expert",
                    level: "13+",
                    internalLevelValue: 13.7,
                    noteDesigner: "佑",
                    noteCounts: .init(tap: nil, hold: nil, slide: nil, touch: nil, noteCountsBreak: nil, total: nil),
                    regions: .init(jp: true, intl: false, cn: false),
                    isSpecial: false,
                    version: .buddies,
                    multiverInternalLevelValue: nil,
                    comment: nil,
                    internalID: nil
                ),
                .init(
                    type: .dx,
                    difficulty: "master",
                    level: "14+",
                    internalLevelValue: 14.7,
                    noteDesigner: "project_raputa",
                    noteCounts: .init(tap: nil, hold: nil, slide: nil, touch: nil, noteCountsBreak: nil, total: nil),
                    regions: .init(jp: true, intl: false, cn: false),
                    isSpecial: false,
                    version: .buddies,
                    multiverInternalLevelValue: nil,
                    comment: nil,
                    internalID: nil
                ),
                .init(
                    type: .dx,
                    difficulty: "remaster",
                    level: "14+",
                    internalLevelValue: 14.9,
                    noteDesigner: "project_raputa",
                    noteCounts: .init(tap: nil, hold: nil, slide: nil, touch: nil, noteCountsBreak: nil, total: nil),
                    regions: .init(jp: true, intl: false, cn: false),
                    isSpecial: false,
                    version: .buddies,
                    multiverInternalLevelValue: nil,
                    comment: nil,
                    internalID: nil
                )
            ],
            searchAcronyms: []
        )
    }
    #endif
}

let omitDifficulties: [String] = [
    "basic",
    "advanced"
]

struct Sheet: Codable, Identifiable {
    var id: String {
        return "\(type)-\(difficulty)"
    }
    
    let type: TypeEnum
    let difficulty: String
    let level: String
    let internalLevelValue: Double
    let noteDesigner: String?
    let noteCounts: NoteCounts
    let regions: Regions
    let isSpecial: Bool
    let version: VersionEnum?
    let multiverInternalLevelValue: [String: Double]?
    let comment: String?
    let internalID: Int?
    
    var difficultyWithType: String {
        return "[\(type.rawValue.uppercased())] \(difficulty)"
    }
    
    enum CodingKeys: String, CodingKey {
        case type, difficulty, level, internalLevelValue, noteDesigner, noteCounts, regions, isSpecial, version
        case multiverInternalLevelValue, comment
        case internalID = "internalId"
    }
    
    func formatted() -> String {
        var sections: [String] = []
        if !omitDifficulties.contains(self.difficulty) {
            sections.append(self.difficulty.capitalized)
        }
        
        sections.append(String(internalLevelValue))
        
        return sections.joined(separator: " ")
    }
}
