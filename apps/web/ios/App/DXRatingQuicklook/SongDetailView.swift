//
//  SongDetailView.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 10/22/23.
//

import SwiftUI

struct SongDetailView: View {
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
            ForEach(song.sheets.filter({ $0.internalLevelValue != nil && $0.internalLevelValue != 0 }), id: \.difficulty) { sheet in
                HStack {
                    HStack {
                        HStack(spacing: 0) {
                            Text(sheet.difficulty.uppercased())
                                .bold()
                                .foregroundColor(.white)
                                .monospaced()
                            Spacer()
                        }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .frame(width: 105)
                            .background(
                                UIColor(rgb: difficultyToColorDictionary[sheet.difficulty] ?? 0x000000)
                                    .color
                            )
                        
                        HStack {
                            Text("\((sheet.internalLevelValue ?? 0.0) as NSNumber, formatter: formatter)")
                                .monospacedDigit()
                            
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
    SongDetailView(song: .demo())
}
