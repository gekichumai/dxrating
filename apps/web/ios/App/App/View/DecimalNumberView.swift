//
//  DecimalNumberView.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 1/12/24.
//

import SwiftUI

struct DecimalNumberView: View {
    let value: Double
    
    private var wholePart: String {
        return String(Int(value))
    }
    
    private var decimalPart: String {
        return String(Int(((value - Double(Int(value))) * 10).rounded()))
    }
    
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(wholePart + ".")
                .tracking(-1)
                .font(.system(.body, design: .monospaced))
                .fontWeight(.semibold)
                .opacity(0.8)
            
            Text(decimalPart)
                .font(.system(.title2, design: .monospaced))
                .fontWeight(.bold)
        }
    }
}

@available(iOS 17.0, *)
#Preview("7.0", traits: .sizeThatFitsLayout) {
    DecimalNumberView(value: 7.0)
        .padding()
}

@available(iOS 17.0, *)
#Preview("13.6", traits: .sizeThatFitsLayout) {
    DecimalNumberView(value: 13.6)
        .padding()
}

@available(iOS 17.0, *)
#Preview("14.9", traits: .sizeThatFitsLayout) {
    DecimalNumberView(value: 14.9)
        .padding()
}
