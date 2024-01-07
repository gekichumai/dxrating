//
//  SongLevelView.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 10/22/23.
//

import SwiftUI

struct SongLevelView: View {
    let song: Song
    
    let difficultyToColorDictionary: [String: Int] = [
        "basic": 0x22bb5b,
        "advanced": 0xfb9c2d,
        "expert": 0xf64861,
        "master": 0x9e45e2,
        "remaster": 0xba67f8
    ]
    
    let formatter: NumberFormatter = ({
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 1
        f.maximumFractionDigits = 1
        return f
    })()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(song.sheets, id: \.id) { sheet in
                HStack {
                    HStack {
                        HStack(spacing: 0) {
                            Text(sheet.type.rawValue.uppercased())
                                .font(.system(.caption, design: .rounded))
                                .bold()
                                .foregroundColor(.white)
                                .frame(width: 26)
                                
                            
                            // vertical divider
                            Rectangle()
                                .frame(width: 1, height: 12)
                                .foregroundColor(.white)
                                .opacity(0.5)
                                .padding(.horizontal, 8)
                            
                            Text(sheet.difficulty.uppercased())
                                .font(.system(.caption, design: .rounded))
                                .bold()
                                .foregroundColor(.white)
                            Spacer()
                        }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .frame(width: 145)
                            .background(
                                UIColor(rgb: difficultyToColorDictionary[sheet.difficulty] ?? 0x000000)
                                    .color
                            )
                        
                        HStack {
                            Text("\(sheet.internalLevelValue as NSNumber, formatter: formatter)")
                                .font(.system(.caption, design: .monospaced))
                                .bold()
                                .foregroundColor(.black)
                            
                            Spacer()
                        }
                            .frame(width: 45)
                            .padding(.trailing, 8)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                                        .stroke(UIColor(rgb: difficultyToColorDictionary[sheet.difficulty] ?? 0x000000)
                                            .color, lineWidth: 2)
                    )
                    
                    Spacer()
                }
            }
            
            Spacer()
        }
        .padding(.horizontal, 8)
    }
}

#Preview {
    SongLevelView(song: .demo())
}
