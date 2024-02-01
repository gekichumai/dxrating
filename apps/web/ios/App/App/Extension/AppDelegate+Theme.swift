//
//  AppDelegate+Theme.swift
//  App
//
//  Created by Galvin Gao on 12/20/23.
//

import Foundation
import UIKit

extension AppDelegate {
    func setupThemeListeners() {
        self.themeShouldUpdate(dxVersion: AppPreferences.shared.dxVersion)
        AppPreferences.shared.$dxVersion
            .sink { dxVersion in
                print("dxVersion changed to \(dxVersion)")
                self.themeShouldUpdate(dxVersion: dxVersion)
            }
            .store(in: &cancellables)
    }
    
    func setupRootView() {
        let root = window?.rootViewController
        let rootView = root?.view
        
        // MARK: Capacitor enhancements on WebView
        
        // set background to black to retain visual consistancy
        rootView?.backgroundColor = UIColor.black
        
        // enable bounces since Capacitor seems to disabled it
        rootView?.scrollView.bounces = true
        
        // disable pinch gesture
        rootView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        
        topBarColorChunk.translatesAutoresizingMaskIntoConstraints = false
        rootView?.addSubview(topBarColorChunk)

        guard let leadingAnchor = rootView?.leadingAnchor,
              let widthAnchor   = rootView?.widthAnchor,
              let topAnchor     = rootView?.topAnchor,
              let bottomAnchor  = rootView?.safeAreaLayoutGuide.topAnchor
        else {
            return
        }

        topBarColorChunk.leadingAnchor.constraint(equalTo: leadingAnchor).isActive = true
        topBarColorChunk.widthAnchor.constraint(equalTo: widthAnchor).isActive = true
        topBarColorChunk.topAnchor.constraint(equalTo: topAnchor).isActive = true
        topBarColorChunk.bottomAnchor.constraint(equalTo: bottomAnchor).isActive = true
    }
    
    func themeShouldUpdate(dxVersion: DXVersion) {
        DispatchQueue.main.async {
            if dxVersion == .buddies {
                self.changeAppIcon(to: "appicon-buddies")
                UIView.animate(withDuration: 0.3) {
                    self.topBarColorChunk.backgroundColor = UIColor(named: "accent-buddies")
                    self.topBarColorChunk.layoutIfNeeded()
                }
            } else {
                self.changeAppIcon(to: nil)
                UIView.animate(withDuration: 0.3) {
                    self.topBarColorChunk.backgroundColor = UIColor(named: "accent-festival-plus")
                    self.topBarColorChunk.layoutIfNeeded()
                }
            }
        }
    }
    
    func changeAppIcon(to name: String?) {
        if UIApplication.shared.alternateIconName != name {
            UIApplication.shared.setAlternateIconName(name)
        }
    }
}
