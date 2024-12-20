//
//  Backport.swift
//  App
//
//  Created by Galvin Gao on 2/2/24.
//

import Foundation

public struct Backport<Content> {
    public let content: Content

    public init(_ content: Content) {
        self.content = content
    }
}
