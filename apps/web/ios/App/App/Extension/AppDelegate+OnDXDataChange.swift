//
//  AppDelegate+OnDXDataChange.swift
//  App
//
//  Created by Galvin Gao on 12/20/23.
//

import Foundation
import CoreSpotlight

extension AppDelegate {
    func initializeDXData() {
        DispatchQueue.global(qos: .background).async {
            let lastDXDataSHA256Sum = UserDefaults.standard.string(forKey: "lastDXDataSHA256Sum") ?? ""
            let dxDataSHA256Sum = AppData.calculateDXDataSha256()
            
            if dxDataSHA256Sum == lastDXDataSHA256Sum {
                print("dxdata.json unchanged. skipping cover uncompression and Spotlight indexing")
                return
            }
            
            // unzip Assets/Covers.zip into Assets/Covers/...files
            let coversZip = Bundle.main.url(forResource: "Covers", withExtension: "zip", subdirectory: "Assets")
            let coversDir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: AppIdentifier.assetsAppGroup)?.appendingPathComponent("Covers")
            if let coversZip = coversZip, let coversDir = coversDir {
                if !FileManager.default.fileExists(atPath: coversDir.path) {
                    guard let _ = try? FileManager.default.unzipItem(at: coversZip, to: coversDir) else {
                        print("unable to unzip covers")
                        return
                    }
                } else {
                    print("covers already unzipped")
                }
            }
            
            if let dxData = AppData.loadDXData() {
                if #available(iOS 14.0, *) {
                    let explicitSheetTypeOrder: [TypeEnum] = [.utage2P, .utage, .dx, .std]
                    
                    var items: [CSSearchableItem] = []
                    for song in dxData.songs {
                        let id = song.songID
                        let attributeSet = CSSearchableItemAttributeSet(contentType: .item)
                        let sheetTypes = song.sheets.reduce(into: Set<TypeEnum>(), { (result, sheet) in
                            result.insert(sheet.type)
                        })
                        // sort sheet types as: "dx", "std", ...rest
                        let sortedSheetTypes = sheetTypes.sorted { (a, b) -> Bool in
                            if let aIndex = explicitSheetTypeOrder.firstIndex(of: a) {
                                if let bIndex = explicitSheetTypeOrder.firstIndex(of: b) {
                                    return aIndex < bIndex
                                } else {
                                    return true
                                }
                            } else {
                                return false
                            }
                        }
                        attributeSet.title = song.title
                        attributeSet.displayName = song.title
                        attributeSet.contentDescription = sortedSheetTypes
                            .map({ type in
                                let content = song.sheets
                                    .filter({ sheet in
                                        return sheet.type == type
                                    })
                                    .map({ sheet in
                                        return sheet.formatted()
                                    })
                                    .joined(separator: " | ")
                                
                                return "\(type.rawValue.uppercased()): (\(content))"
                            })
                            .joined(separator: "\n")
                        
                        attributeSet.identifier = song.songID
                        attributeSet.alternateNames = song.searchAcronyms
                        attributeSet.keywords = song.searchAcronyms
                        attributeSet.relatedUniqueIdentifier = dxData.songs.first(where: { $0.title == song.title && $0.songID != song.songID })?.songID
//                        if #available(iOS 15.0, *) {
//                            attributeSet.actionIdentifiers = ["STAR_UNSTAR"]
//                        }
                        let resource = song.imageName
                        if let thumbnailURL = coversDir?.appendingPathComponent(resource) {
                            attributeSet.thumbnailURL = thumbnailURL
                        } else {
                            print("unable to find thumbnail for \(song.imageName)")
                        }
                        let item = CSSearchableItem(uniqueIdentifier: id, domainIdentifier: AppIdentifier.of(entityName: "song"), attributeSet: attributeSet)
                        item.expirationDate = .distantFuture
                        items.append(item)
                    }
                    CSSearchableIndex.default().indexSearchableItems(items) { error in
                        if let error = error {
                            print("Indexing error: \(error.localizedDescription)")
                        } else {
                            print("Successfully indexed \(items.count) items.")
                        }
                    }
                }
            }
            
            UserDefaults.standard.set(dxDataSHA256Sum, forKey: "lastDXDataSHA256Sum")
            print("finished uncompressing covers and indexing for dxdata with SHA256 \(String(describing: dxDataSHA256Sum))")
        }
    }
}
