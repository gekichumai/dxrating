//
//  WrappedSongDetailView.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 1/7/24.
//

import SwiftUI

struct WrappedSongDetailView: View {
    @StateObject var state = WrappedSongDetailViewState(song: nil)

    var body: some View {
        Group {
            if self.state.song != nil {
                SongDetailView(song: self.state.song!)
                    .environment(\.colorScheme, .light)
                    .background(Color.white)
                    .cornerRadius(8)
            } else {
                HStack {
                    VStack(alignment: .leading) {
                        Color.gray
                            .frame(width: 64, height: 64)
                            .opacity(0.3)
                            .cornerRadius(4)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("          ")
                                .font(.title)
                                .bold()
                                .foregroundColor(.black)
                                .redacted(reason: .placeholder)

                            Text("          ")
                                .font(.subheadline)
                                .foregroundColor(.black)
                                .redacted(reason: .placeholder)
                        }

                        Spacer()
                    }

                    Spacer()
                }
                .padding(16)
                // fill frame
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.white.opacity(0.3))
                .cornerRadius(8)
            }
        }
    }
}

final class WrappedSongDetailViewState: ObservableObject {
    @Published var song: Song? = nil

    init(song: Song?) {
        self.song = song
    }
}

#if DEBUG
    @available(iOS 17.0, *)
    #Preview("empty", traits: .sizeThatFitsLayout) {
        WrappedSongDetailView()
    }

    @available(iOS 17.0, *)
    #Preview("exists", traits: .sizeThatFitsLayout) {
        WrappedSongDetailView(state: WrappedSongDetailViewState(song: .demo()))
    }
#endif
