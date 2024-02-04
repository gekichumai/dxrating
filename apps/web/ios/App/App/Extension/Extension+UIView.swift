//
//  Extension+UIView.swift
//  App
//
//  Created by Galvin Gao on 12/25/23.
//

import Foundation
import UIKit

extension UIView {
    func addPadding(_ padding: UIEdgeInsets) {
        guard let superview = superview else { return }

        let paddedView = UIView()
        superview.addSubview(paddedView)
        paddedView.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            paddedView.topAnchor.constraint(equalTo: superview.topAnchor, constant: padding.top),
            paddedView.bottomAnchor.constraint(equalTo: superview.bottomAnchor, constant: -padding.bottom),
            paddedView.leadingAnchor.constraint(equalTo: superview.leadingAnchor, constant: padding.left),
            paddedView.trailingAnchor.constraint(equalTo: superview.trailingAnchor, constant: -padding.right),
        ])

        superview.bringSubviewToFront(self)
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: paddedView.topAnchor),
            bottomAnchor.constraint(equalTo: paddedView.bottomAnchor),
            leadingAnchor.constraint(equalTo: paddedView.leadingAnchor),
            trailingAnchor.constraint(equalTo: paddedView.trailingAnchor),
        ])
    }
}
