//
//  SongLevelView.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 10/22/23.
//

import SwiftUI

struct SongLevelView: View {
    let song: Song
    let hideBasicAdvanced: Bool = false

    let difficultyToColorDictionary: [String: Int] = [
        "basic": 0x22BB5B,
        "advanced": 0xFB9C2D,
        "expert": 0xF64861,
        "master": 0x9E45E2,
        "remaster": 0xBA67F8,
    ]

    let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 1
        f.maximumFractionDigits = 1
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(song.sheets.reversed(), id: \.id) { sheet in
                HStack(spacing: 0) {
                    HStack(spacing: 0) {
                        HStack(spacing: 0) {
                            Text(sheet.type.rawValue.uppercased())
                                .font(.system(.title3, design: .rounded))
                                .bold()
                                .foregroundColor(.white)
//                                .frame(width: 26)

                            // vertical divider
                            Rectangle()
                                // half frame height
                                .frame(width: 1, height: 24)
                                .foregroundColor(.white)
                                .opacity(0.5)
                                .padding(.horizontal, 8)

                            Text(sheet.difficulty.uppercased())
                                .font(.system(.body, design: .rounded))
                                .bold()
                                .foregroundColor(.white)
                            Spacer()
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 8)
//                            .frame(width: 135)
                        // fill vertically
                        .frame(maxWidth: .infinity)
                        .background(
                            UIColor(rgb: difficultyToColorDictionary[sheet.difficulty] ?? 0x000000)
                                .color
                        )

                        DecimalNumberView(value: sheet.internalLevelValue)
                            .padding(.horizontal, 8)
                    }
                    .clipShape(
                        RoundedRectangle(cornerRadius: 4)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(
                                UIColor(rgb: difficultyToColorDictionary[sheet.difficulty] ?? 0x000000)
                                    .color, lineWidth: 2
                            )
                    )
                }
            }
        }
    }
}

#if DEBUG
    @available(iOS 17.0, *)
    #Preview(traits: .sizeThatFitsLayout) {
        SongLevelView(song: .demo())
            .padding()
            .previewLayout(.sizeThatFits)
    }
#endif
