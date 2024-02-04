/*
 See LICENSE folder for this sample’s licensing information.

 Abstract:
 Main view controller that handles camera, preview, and cutout UI.
 */

import AVFoundation
import Fuse
import SwifterSwift
import SwiftUI
import UIKit
import Vision

class InstantOCRViewController: UIViewController {
    // MARK: - UI objects

    var previewView = PreviewView()
    var detailViewState = WrappedSongDetailViewState(song: nil)
    var cutoutView = UIView()
    var closeButtonView = UIButton(type: .close)

    var maskLayer = CAShapeLayer()
    // The device orientation that's updated whenever the orientation changes to a
    // different supported orientation.
    var currentOrientation = UIDeviceOrientation.portrait

    // MARK: - Capture related objects

    private let captureSession = AVCaptureSession()
    let captureSessionQueue = DispatchQueue(label: AppIdentifier.of(entityName: "CaptureSessionQueue"))

    var captureDevice: AVCaptureDevice?

    var videoDataOutput = AVCaptureVideoDataOutput()
    let videoDataOutputQueue = DispatchQueue(label: AppIdentifier.of(entityName: "VideoDataOutputQueue"))

    // MARK: - Region of interest (ROI) and text orientation

    // The region of the video data output buffer that recognition should be run on,
    // which gets recalculated once the bounds of the preview layer are known.
    var regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
    // The text orientation to search for in the region of interest (ROI).
    var textOrientation = CGImagePropertyOrientation.up

    // MARK: - Coordinate transforms

    var bufferAspectRatio: Double!
    // Transform from UI orientation to buffer orientation.
    var uiRotationTransform = CGAffineTransform.identity
    // Transform bottom-left coordinates to top-left.
    var bottomToTopTransform = CGAffineTransform(scaleX: 1, y: -1).translatedBy(x: 0, y: -1)
    // Transform coordinates in ROI to global coordinates (still normalized).
    var roiToGlobalTransform = CGAffineTransform.identity

    // Vision to AVFoundation coordinate transform.
    var visionToAVFTransform = CGAffineTransform.identity

    var request: VNRecognizeTextRequest!

    var customWords: [String] = []

    var dxdata: DXData!

//    var supportedInterfaceOrientations: UIInterfaceOrientationMask = .portrait

    // MARK: - View controller methods

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground

        view.addSubview(previewView)
        previewView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            previewView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            previewView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            previewView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            previewView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        view.addSubview(cutoutView)
        cutoutView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            cutoutView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cutoutView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            cutoutView.topAnchor.constraint(equalTo: view.topAnchor),
            cutoutView.leftAnchor.constraint(equalTo: view.leftAnchor),
        ])

//        self.view.addSubview(self.labelView)
//        self.labelView.translatesAutoresizingMaskIntoConstraints = false
//        NSLayoutConstraint.activate([
//            self.labelView.centerXAnchor.constraint(equalTo: self.view.centerXAnchor),
//            self.labelView.centerYAnchor.constraint(equalTo: self.view.centerYAnchor, constant: 64.0),
//            self.labelView.topAnchor.constraint(equalTo: self.view.centerYAnchor, constant: 64.0),
//            self.labelView.heightAnchor.constraint(equalToConstant: 64.0),
//            self.labelView.leadingAnchor.constraint(equalTo: self.cutoutView.leadingAnchor, constant: 48.0),
//            self.labelView.trailingAnchor.constraint(equalTo: self.cutoutView.trailingAnchor, constant: -48.0)
//        ])
//        self.labelView.backgroundColor = .white
//        self.labelView.textColor = .black
//        self.labelView.numberOfLines = 14
//        self.labelView.minimumScaleFactor = 0.5
//        self.labelView.font = .monospacedSystemFont(ofSize: 15, weight: .regular)
//        self.labelView.addPadding(.init(inset: 8.0))

        // present the detail view
        let detailVC = UIHostingController(rootView: WrappedSongDetailView(state: detailViewState))
        addChild(detailVC)
        view.addSubview(detailVC.view)
        detailVC.view.translatesAutoresizingMaskIntoConstraints = false
        detailVC.view.backgroundColor = .clear
        NSLayoutConstraint.activate([
            detailVC.view.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            detailVC.view.topAnchor.constraint(equalTo: view.centerYAnchor, constant: -64.0),
            detailVC.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            detailVC.view.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32.0),
            detailVC.view.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32.0),
        ])

        view.addSubview(closeButtonView)
        closeButtonView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            closeButtonView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24.0),
            closeButtonView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24.0),
            closeButtonView.widthAnchor.constraint(equalToConstant: 32.0),
            closeButtonView.heightAnchor.constraint(equalToConstant: 32.0),
        ])
        closeButtonView.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButtonView.tintColor = .white
        closeButtonView.addTarget(self, action: #selector(closeButtonTapped), for: .touchUpInside)

        request = VNRecognizeTextRequest(completionHandler: recognizeTextHandler)

        dxdata = AppData.loadDXData()
        customWords = dxdata.songs.map { song in
            song.title
        }

        // Set up the preview view.
        previewView.session = captureSession

        // Set up the cutout view.
        cutoutView.backgroundColor = UIColor.gray.withAlphaComponent(0.5)
        maskLayer.backgroundColor = UIColor.clear.cgColor
        maskLayer.fillRule = .evenOdd
        cutoutView.layer.mask = maskLayer

        // Starting the capture session is a blocking call. Perform setup using
        // a dedicated serial dispatch queue to prevent blocking the main thread.
        captureSessionQueue.async {
            self.setupCamera()

            // Calculate the ROI now that the camera is setup.
            DispatchQueue.main.async {
                // Figure out the initial ROI.
                self.calculateRegionOfInterest()
            }
        }
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)

        // Only change the current orientation if the new one is landscape or portrait.
        let deviceOrientation = UIDevice.current.orientation
        if deviceOrientation.isPortrait || deviceOrientation.isLandscape {
            currentOrientation = deviceOrientation
        }

        // Handle device orientation in the preview layer.
        if let videoPreviewLayerConnection = previewView.videoPreviewLayer.connection {
            if let newVideoOrientation = AVCaptureVideoOrientation(deviceOrientation: deviceOrientation) {
                videoPreviewLayerConnection.videoOrientation = newVideoOrientation
            }
        }

        // The orientation changed. Figure out the new ROI.
        calculateRegionOfInterest()
    }

    override func viewWillAppear(_: Bool) {
        captureSessionQueue.async {
            self.captureSession.startRunning()
        }
    }

    override func viewWillDisappear(_: Bool) {
        captureSession.stopRunning()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        updateCutout()
    }

    // MARK: - Setup

    @objc
    func closeButtonTapped() {
        dismiss(animated: true, completion: nil)
    }

    func calculateRegionOfInterest() {
        // In landscape orientation, the desired ROI is specified as the ratio of
        // buffer width to height. When the UI is rotated to portrait, keep the
        // vertical size the same (in buffer pixels). Also try to keep the
        // horizontal size the same up to a maximum ratio.
        let desiredHeightRatio = 0.12
        let desiredWidthRatio = 0.6
        let maxPortraitWidth = 0.8

        // Figure out the size of the ROI.
        let size: CGSize
        if currentOrientation.isPortrait || currentOrientation == .unknown {
            size = CGSize(width: min(desiredWidthRatio * bufferAspectRatio, maxPortraitWidth), height: desiredHeightRatio / bufferAspectRatio)
        } else {
            size = CGSize(width: desiredWidthRatio, height: desiredHeightRatio)
        }
        // Center the ROI.
        regionOfInterest.origin = CGPoint(x: (1 - size.width) / 2, y: (1 - size.height) * (2 / 3))
        regionOfInterest.size = size

        // The ROI changed, so update the transform.
        setupOrientationAndTransform()

        // Update the cutout to match the new ROI.
        DispatchQueue.main.async {
            // Wait for the next run cycle before updating the cutout. This
            // ensures that the preview layer already has its new orientation.
            self.updateCutout()
        }
    }

    func updateCutout() {
        // Figure out where the cutout ends up in layer coordinates.
        let roiRectTransform = bottomToTopTransform.concatenating(uiRotationTransform)
        let cutout = previewView.videoPreviewLayer.layerRectConverted(fromMetadataOutputRect: regionOfInterest.applying(roiRectTransform))

        // Create the mask.
        let path = UIBezierPath(rect: cutoutView.frame)
        path.append(UIBezierPath(rect: cutout))
        maskLayer.path = path.cgPath
    }

    func setupOrientationAndTransform() {
        // Recalculate the affine transform between Vision coordinates and AVFoundation coordinates.

        // Compensate for the ROI.
        let roi = regionOfInterest
        roiToGlobalTransform = CGAffineTransform(translationX: roi.origin.x, y: roi.origin.y).scaledBy(x: roi.width, y: roi.height)

        // Compensate for the orientation. Buffers always come in the same orientation.
        switch currentOrientation {
        case .landscapeLeft:
            textOrientation = .up
            uiRotationTransform = .identity
        case .landscapeRight:
            textOrientation = .down
            uiRotationTransform = CGAffineTransform(translationX: 1, y: 1).rotated(by: CGFloat.pi)
        case .portraitUpsideDown:
            textOrientation = .left
            uiRotationTransform = CGAffineTransform(translationX: 1, y: 0).rotated(by: CGFloat.pi / 2)
        default: // Default everything else to .portraitUp.
            textOrientation = .right
            uiRotationTransform = CGAffineTransform(translationX: 0, y: 1).rotated(by: -CGFloat.pi / 2)
        }

        // The full Vision ROI to AVFoundation transform.
        visionToAVFTransform = roiToGlobalTransform.concatenating(bottomToTopTransform).concatenating(uiRotationTransform)
    }

    func setupCamera() {
        guard let captureDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            print("Could not create capture device.")
            return
        }
        self.captureDevice = captureDevice

        // Requesting 4K buffers allows recognition of smaller text but consumes
        // more power. Use the smallest buffer size necessary to minimize
        // battery usage.
        //		if captureDevice.supportsSessionPreset(.hd4K3840x2160) {
        //			captureSession.sessionPreset = .hd4K3840x2160
        //			bufferAspectRatio = 3840.0 / 2160.0
        //		} else {
        captureSession.sessionPreset = .hd1920x1080
        bufferAspectRatio = 1920.0 / 1080.0
        //		}

        guard let deviceInput = try? AVCaptureDeviceInput(device: captureDevice) else {
            print("Could not create device input.")
            return
        }
        if captureSession.canAddInput(deviceInput) {
            captureSession.addInput(deviceInput)
        }

        // Configure the video data output.
        videoDataOutput.alwaysDiscardsLateVideoFrames = true
        videoDataOutput.setSampleBufferDelegate(self, queue: videoDataOutputQueue)
        videoDataOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        if captureSession.canAddOutput(videoDataOutput) {
            captureSession.addOutput(videoDataOutput)
            videoDataOutput.connection(with: .video)?.preferredVideoStabilizationMode = .standard
        } else {
            print("Could not add VDO output")
            return
        }

        // Set zoom and autofocus to help focus on very small text.
        do {
            try captureDevice.lockForConfiguration()
            captureDevice.videoZoomFactor = 2
            captureDevice.autoFocusRangeRestriction = .near
            captureDevice.unlockForConfiguration()
        } catch {
            print("Could not set zoom level due to error: \(error)")
            return
        }

        captureSession.startRunning()
    }
}

// MARK: - Search

extension InstantOCRViewController {
    func search(keyword: String, completion: @escaping (String, Song?) -> Void) {
        let fuse = Fuse(distance: 25, threshold: 0.5)
        fuse.search(keyword.truncated(toLength: 32), in: customWords) { results in
            guard let first = results.first else {
                completion("\(keyword)\n(no result)", nil)
                return
            }

            let title = self.customWords[first.index]
            guard let song = self.dxdata.songs.first(where: { $0.title == title }) else {
                completion("\(title)\n(ERROR: no match)", nil)
                return
            }

            completion("\(title)\n\(song.sheets.map { $0.formatted() }.joined(separator: "\n"))", song)
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension InstantOCRViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    // MARK: - Text recognition

    // The Vision recognition handler.
    func recognizeTextHandler(request: VNRequest, error _: Error?) {
        var recognizedText = ""

        guard let results = request.results as? [VNRecognizedTextObservation] else {
            return
        }

        let maximumCandidates = 1

        for visionResult in results {
            guard let candidate = visionResult.topCandidates(maximumCandidates).first else { continue }
            recognizedText.append(candidate.string)
        }

        search(keyword: recognizedText) { _, song in
            DispatchQueue.main.async {
                self.detailViewState.song = song
            }
        }
    }

    func captureOutput(_: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from _: AVCaptureConnection) {
        if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
            // Configure for running in real time.
            request.recognitionLevel = .accurate
            // Language correction doesn't help in recognizing phone numbers and also
            // slows recognition.
            request.usesLanguageCorrection = false
            // Only run on the region of interest for maximum speed.
            request.regionOfInterest = regionOfInterest
            request.recognitionLanguages = ["ja_JP", "en_US"]
            request.customWords = customWords

            let requestHandler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: textOrientation, options: [:])
            do {
                try requestHandler.perform([request])
            } catch {
                print(error)
            }
        }
    }
}

// MARK: - Utility extensions

extension AVCaptureVideoOrientation {
    init?(deviceOrientation: UIDeviceOrientation) {
        switch deviceOrientation {
        case .portrait: self = .portrait
        case .portraitUpsideDown: self = .portraitUpsideDown
        case .landscapeLeft: self = .landscapeRight
        case .landscapeRight: self = .landscapeLeft
        default: return nil
        }
    }
}
