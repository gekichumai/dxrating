import UIKit
import Capacitor
import CoreSpotlight
import ZIPFoundation
import Combine

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    var topBarColorChunk = UIView()
    
    private var cancellables = Set<AnyCancellable>()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // common controllers
        let root = window?.rootViewController
        let rootView = root?.view
        
        // MARK: Capacitor enhancements on WebView
        
        // set background to black to retain visual consistancy
        rootView?.backgroundColor = UIColor.black
        
        // enable bounces since Capacitor seems to disabled it
        rootView?.scrollView.bounces = true
        
        // disable pinch gesture
        rootView?.scrollView.pinchGestureRecognizer?.isEnabled = false
        
        if let options = launchOptions {
            let notif = options[UIApplication.LaunchOptionsKey.remoteNotification] as? [NSDictionary]
            print("remote notification launch option", notif ?? "null")
        }

        topBarColorChunk.translatesAutoresizingMaskIntoConstraints = false
        rootView?.addSubview(topBarColorChunk)

        guard let leadingAnchor = rootView?.leadingAnchor,
              let widthAnchor   = rootView?.widthAnchor,
              let topAnchor     = rootView?.topAnchor,
              let bottomAnchor  = rootView?.safeAreaLayoutGuide.topAnchor
        else {
            return true
        }

        topBarColorChunk.leadingAnchor.constraint(equalTo: leadingAnchor).isActive = true
        topBarColorChunk.widthAnchor.constraint(equalTo: widthAnchor).isActive = true
        topBarColorChunk.topAnchor.constraint(equalTo: topAnchor).isActive = true
        topBarColorChunk.bottomAnchor.constraint(equalTo: bottomAnchor).isActive = true
        // Override point for customization after application launch.
        
        // MARK: Cover.zip expansion & Spotlight indexing
        
        DispatchQueue.global(qos: .background).async {
            let lastDXDataSHA256Sum = UserDefaults.standard.string(forKey: "lastDXDataSHA256Sum") ?? ""
            let dxDataSHA256Sum = AppData.calculateDXDataSha256()
            
            if dxDataSHA256Sum == lastDXDataSHA256Sum {
                print("dxdata.json unchanged. skipping cover uncompression and Spotlight indexing")
                return
            }
            
            // unzip Assets/Covers.zip into Assets/Covers/...files
            let coversZip = Bundle.main.url(forResource: "Covers", withExtension: "zip", subdirectory: "Assets")
            let coversBaseDir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.dev.imgg.gekichumai.dxrating.public-shared")
            let coversDir = coversBaseDir?.appendingPathComponent("Covers")
            if let coversZip = coversZip, let coversBaseDir = coversBaseDir, let coversDir = coversDir {
                if !FileManager.default.fileExists(atPath: coversDir.path) {
                    guard let _ = try? FileManager.default.unzipItem(at: coversZip, to: coversBaseDir) else {
                        print("unable to unzip covers")
                        return
                    }
                } else {
                    print("covers already unzipped")
                }
            }
            
            if let dxData = AppData.loadDXData() {
                if #available(iOS 14.0, *) {
                    let explicitSheetTypeOrder = ["dx", "std"]
                    
                    var items: [CSSearchableItem] = []
                    for song in dxData.songs {
                        let id = "\(song.songId)"
                        let attributeSet = CSSearchableItemAttributeSet(contentType: .item)
                        let sheetTypes = song.sheets.reduce(into: Set<String>(), { (result, sheet) in
                            result.insert(sheet.type)
                        })
                        // sort sheet types as: "dx", "std", ...rest
                        let sortedSheetTypes = sheetTypes.sorted { (a, b) -> Bool in
                            if let aIndex = explicitSheetTypeOrder.firstIndex(of: a) {
                                if let bIndex = explicitSheetTypeOrder.firstIndex(of: b) {
                                    return aIndex < bIndex
                                } else {
                                    return true
                                }
                            } else {
                                return false
                            }
                        }
                        attributeSet.title = song.title
                        attributeSet.displayName = song.title
                        attributeSet.contentDescription = sortedSheetTypes
                            .map({ type in
                                let content = song.sheets
                                    .filter({ sheet in
                                        return sheet.type == type
                                    })
                                    .map({ sheet in
                                        return sheet.formatted()
                                    })
                                    .joined(separator: " | ")
                                
                                return "\((type == "std" ? "sd" : type).uppercased()): (\(content))"
                            })
                            .joined(separator: "\n")
                        
                        attributeSet.identifier = song.songId
                        attributeSet.alternateNames = song.searchAcronyms
//                        if #available(iOS 15.0, *) {
//                            attributeSet.actionIdentifiers = ["STAR_UNSTAR"]
//                        }
                        let resource = song.imageName.replacingOccurrences(of: ".png", with: ".jpg")
                        if let thumbnailURL = coversDir?.appendingPathComponent("Covers").appendingPathComponent(resource) {
                            attributeSet.thumbnailURL = thumbnailURL
                        } else {
                            print("unable to find thumbnail for \(song.imageName)")
                        }
                        let item = CSSearchableItem(uniqueIdentifier: id, domainIdentifier: "dev.imgg.gekichumai.dxrating", attributeSet: attributeSet)
                        item.expirationDate = .distantFuture
                        items.append(item)
                    }
                    CSSearchableIndex.default().indexSearchableItems(items) { error in
                        if let error = error {
                            print("Indexing error: \(error.localizedDescription)")
                        } else {
                            print("Successfully indexed \(items.count) items.")
                        }
                    }
                }
            }
            
            UserDefaults.standard.set(dxDataSHA256Sum, forKey: "lastDXDataSHA256Sum")
            print("finished uncompressing covers and indexing for dxdata with SHA256 \(String(describing: dxDataSHA256Sum))")
        }
        
        // MARK: Update App Icon based on AppPreferences
        
        self.themeShouldUpdate(dxVersion: AppPreferences.shared.dxVersion)
        AppPreferences.shared.$dxVersion
            .sink { dxVersion in
                print("dxVersion changed to \(dxVersion)")
                self.themeShouldUpdate(dxVersion: dxVersion)
            }
            .store(in: &cancellables)
        
        return true
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

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == CSSearchableItemActionType {
            // The activity is a Spotlight search.
            // Here you can get the unique identifier of the indexed item with the activity's userInfo
            if let uniqueIdentifier = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
                // Handle Spotlight search here. The uniqueIdentifier can be used to display related content in your app.
                print("App continue with Spotlight userActivity with unique identifier \(uniqueIdentifier)")
            }
        }
        
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
