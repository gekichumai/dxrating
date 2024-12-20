//
//  SwiftUI.swift
//  App
//
//  Created by Galvin Gao on 2/2/24.
//

import Foundation
import SwiftUI

extension View {
    var backport: Backport<Self> { Backport(self) }
}

extension Backport where Content: View {
//    @ViewBuilder func tracking(_ tracking: CGFloat) -> some View {
//        if #available(iOS 16, *) {
//            content.tracking(tracking)
//        } else {
//            content
//        }
//    }
}
