//
//  PreviewViewController.swift
//  DXRatingQuicklook
//
//  Created by Galvin Gao on 10/21/23.
//

import UIKit
import QuickLook
import SwiftUI

class PreviewViewController: UIViewController, QLPreviewingController {
    @IBOutlet weak var coverImage: UIImageView!
    @IBOutlet weak var containerView: UIView!
    @IBOutlet weak var songTitle: UILabel!
    
    var difficultiesContainerView: UIStackView!
    
    let difficultyToColorDictionary: [String: Int] = [
        "basic": 0x22bb5b,
        "advanced": 0xfb9c2d,
        "expert": 0xf64861,
        "master": 0x9e45e2,
        "remaster": 0xba67f8
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
            handler(AppError.custom(errorDescription: "failed to load DX data"))
            return
        }
        
        print("preparePreviewOfSearchableItem: \(identifier); \(String(describing: queryString))")
        
        guard let song = dxdata.songs.first(where: { $0.songId == identifier }) else {
            handler(AppError.custom(errorDescription: "failed to find song"))
            return
        }
        
        var bundle = Bundle.main
        if bundle.bundleURL.pathExtension == "appex" {
            // Peel off two directory levels - MY_APP.app/PlugIns/MY_APP_EXTENSION.appex
            let url = bundle.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
            if let otherBundle = Bundle(url: url) {
                bundle = otherBundle
            }
        }
        
        guard let imageUrl = bundle.url(forResource: song.imageName.replacingOccurrences(of: ".png", with: ""), withExtension: "jpg", subdirectory: "Assets/Covers") else {
            handler(AppError.custom(errorDescription: "failed to find image"))
            return
        }
        
        guard let imageData = try? Data(contentsOf: imageUrl) else {
            handler(AppError.custom(errorDescription: "failed to load image"))
            return
        }
        
        guard let uiImage = UIImage(data: imageData) else {
            handler(AppError.custom(errorDescription: "failed to init image from data"))
            return
        }
        
        self.coverImage.image = uiImage
        self.coverImage.layer.cornerRadius = 4.0
        self.coverImage.layer.shadowRadius = 12.0
        self.coverImage.layer.shadowOpacity = 1.0
        self.coverImage.layer.shadowColor = CGColor(gray: 1.0, alpha: 0.2)
        self.songTitle.text = song.title

//        self.difficultiesContainerView = UIStackView()
//        self.containerView.addSubview(self.difficultiesContainerView)
        
//        self.difficultiesContainerView.translatesAutoresizingMaskIntoConstraints = false
//        self.difficultiesContainerView.topAnchor.constraint(equalToSystemSpacingBelow: self.songTitle.bottomAnchor, multiplier: 1.0).isActive = true
//        self.difficultiesContainerView.leftAnchor.constraint(equalTo: self.containerView.leftAnchor, constant: 1.0).isActive = true
//        self.difficultiesContainerView.rightAnchor.constraint(equalTo: self.containerView.rightAnchor, constant: 1.0).isActive = true
//        self.difficultiesContainerView.axis = .vertical
//        self.difficultiesContainerView.alignment = .leading
//        self.difficultiesContainerView.spacing = 4.0
        
//        for sheet in song.sheets {
//            if sheet.internalLevelValue == nil || sheet.internalLevelValue == 0.0 {
//                continue
//            }
//            guard let difficultyHex = self.difficultyToColorDictionary[sheet.difficulty] else {
//                continue
//            }
//            
//            let containerView = UIStackView()
//            containerView.spacing = 4.0
//            containerView.axis = .horizontal
//            containerView.alignment = .center
//            containerView.layer.cornerRadius = 4.0
//            containerView.layer.borderWidth = 1.0
//            containerView.layer.borderColor = UIColor(rgb: difficultyHex).cgColor
//            containerView.layoutMargins = .init(top: 4, left: 8, bottom: 4, right: 8)
//            containerView.layoutMarginsDidChange()
//            
//            let difficultyLabel = UILabel()
//            difficultyLabel.text = sheet.difficulty
//            difficultyLabel.layoutMargins = .init(top: 4, left: 8, bottom: 4, right: 8)
//            difficultyLabel.layoutMarginsDidChange()
//            difficultyLabel.backgroundColor = .init(rgb: difficultyHex)
//            containerView.addArrangedSubview(difficultyLabel)
//            
//            let levelLabel = UILabel()
//            levelLabel.text = sheet.internalLevelValue?.formatted()
//            containerView.addArrangedSubview(levelLabel)
//            
//            self.difficultiesContainerView.addArrangedSubview(containerView)
//        }
        
        let hostingController = UIHostingController(rootView: SongDetailView(song: song))
        self.addChild(hostingController)
        let hostingControllerView = hostingController.view!
        hostingControllerView.translatesAutoresizingMaskIntoConstraints = false
        self.containerView.addSubview(hostingControllerView)
        NSLayoutConstraint.activate([
            hostingControllerView.topAnchor.constraint(equalTo: self.songTitle.bottomAnchor, constant: 16.0),
            hostingControllerView.leftAnchor.constraint(equalTo: self.containerView.leftAnchor),
            hostingControllerView.rightAnchor.constraint(equalTo: self.containerView.rightAnchor),
            hostingControllerView.bottomAnchor.constraint(equalTo: self.containerView.bottomAnchor),
        ])
        hostingController.didMove(toParent: self)
        
        // Call the completion handler so Quick Look knows that the preview is fully loaded.
        // Quick Look will display a loading spinner while the completion handler is not called.
        handler(nil)
    }

}
