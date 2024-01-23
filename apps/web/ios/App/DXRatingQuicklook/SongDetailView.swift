//
//  SongDetailView.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 1/7/24.
//

import SwiftUI

struct SongDetailView: View {
    let song: Song
    
    var body: some View {
        VStack(alignment: .leading) {
            Image(uiImage: song.coverImage ?? UIImage())
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 64)
                .background(Color.primary.opacity(0.4))
                .cornerRadius(4)
                .padding(.horizontal, 16)
                .padding(.top, 16)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title)
                    .font(.title)
                    .bold()
                    .tracking(-0.5)
                
                Text(song.artist)
                    .font(.subheadline)
            }
            .padding(.horizontal, 16)
            
            ScrollView {
                SongLevelView(song: song)
                    .padding(16)
            }
            
            Spacer()
        }
    }
}

@available(iOS 17.0, *)
#Preview(traits: .sizeThatFitsLayout) {
    SongDetailView(song: .demo())
}
