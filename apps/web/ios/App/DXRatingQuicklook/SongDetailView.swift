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
                .background(Color.black.opacity(0.4))
                .cornerRadius(4)
                .padding(.horizontal, 8)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title)
                    .font(.title)
                    .bold()
                    .tracking(-0.5)
                    .foregroundColor(.black)
                
                Text(song.artist)
                    .font(.subheadline)
                    .foregroundColor(.black)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 16)
            
            SongLevelView(song: song)
        }
    }
}

#Preview {
    SongDetailView(song: .demo())
}
