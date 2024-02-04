//
//  PreviewViewController.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 10/21/23.
//

import QuickLook
import SwiftUI
import UIKit

class PreviewViewController: UIViewController, QLPreviewingController {
    @IBOutlet var containerView: UIView!

    let difficultyToColorDictionary: [String: Int] = [
        "basic": 0x22BB5B,
        "advanced": 0xFB9C2D,
        "expert": 0xF64861,
        "master": 0x9E45E2,
        "remaster": 0xBA67F8,
    ]

    override func viewDidLoad() {
        super.viewDidLoad()
        // Do any additional setup after loading the view.
    }

    /*
     * Implement this method and set QLSupportsSearchableItems to YES in the Info.plist of the extension if you support CoreSpotlight.
     */
    func preparePreviewOfSearchableItem(identifier: String, queryString: String?, completionHandler handler: @escaping (Error?) -> Void) {
        // Perform any setup necessary in order to prepare the view.
        guard let dxdata = AppData.loadDXData() else {
            handler(AppError.custom(errorDescription: "failed to load DXData"))
            return
        }

        print("preparePreviewOfSearchableItem: \(identifier); \(String(describing: queryString))")

        guard let song = dxdata.songs.first(where: { $0.songID == identifier }) else {
            handler(AppError.custom(errorDescription: "failed to find song"))
            return
        }

        let state = WrappedSongDetailViewState(song: song)
        let hostingController = UIHostingController(rootView: WrappedSongDetailView(state: state))
        addChild(hostingController)
        let hostingControllerView = hostingController.view!
        hostingControllerView.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(hostingControllerView)
        NSLayoutConstraint.activate([
            hostingControllerView.topAnchor.constraint(equalTo: containerView.topAnchor),
            hostingControllerView.leftAnchor.constraint(equalTo: containerView.leftAnchor),
            hostingControllerView.rightAnchor.constraint(equalTo: containerView.rightAnchor),
            hostingControllerView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
        ])
        hostingController.didMove(toParent: self)

        // Call the completion handler so Quick Look knows that the preview is fully loaded.
        // Quick Look will display a loading spinner while the completion handler is not called.
        handler(nil)
    }
}
