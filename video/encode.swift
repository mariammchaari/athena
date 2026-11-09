// Usage: encode framesDir audio.m4a out.mp4   (macOS built-in H.264 encoder; no ffmpeg needed)
import AVFoundation; import CoreImage; import ImageIO
func run() throws {
  let a = CommandLine.arguments, fm = FileManager.default, names = try fm.contentsOfDirectory(atPath: a[1]).filter { $0.hasSuffix(".jpg") }.sorted()
  let tmp = URL(fileURLWithPath: a[3] + ".video.mov"), out = URL(fileURLWithPath: a[3]); try? fm.removeItem(at: tmp); try? fm.removeItem(at: out)
  let w = try AVAssetWriter(outputURL: tmp, fileType: .mov)
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 1920, AVVideoHeightKey: 1080, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoExpectedSourceFrameRateKey: 30]])
  input.expectsMediaDataInRealTime = false
  let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: 1920, kCVPixelBufferHeightKey as String: 1080])
  w.add(input); w.startWriting(); w.startSession(atSourceTime: .zero)
  for (i, n) in names.enumerated() { autoreleasepool {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1] + "/" + n) as CFURL, nil)!, img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
    var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, ad.pixelBufferPool!, &pb); CVPixelBufferLockBaseAddress(pb!, [])
    let c = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: 1920, height: 1080, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    c.draw(img, in: CGRect(x: 0, y: 0, width: 1920, height: 1080)); CVPixelBufferUnlockBaseAddress(pb!, [])
    ad.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: 30)) } }
  input.markAsFinished(); let s = DispatchSemaphore(value: 0); w.finishWriting { s.signal() }; s.wait()
  let comp = AVMutableComposition(), va = AVURLAsset(url: tmp), aa = AVURLAsset(url: URL(fileURLWithPath: a[2]))
  var vt: [AVAssetTrack] = [], at: [AVAssetTrack] = [], dur = CMTime.zero
  let s2 = DispatchSemaphore(value: 0); Task { vt = try await va.loadTracks(withMediaType: .video); at = try await aa.loadTracks(withMediaType: .audio); dur = try await va.load(.duration); s2.signal() }; s2.wait()
  try comp.addMutableTrack(withMediaType: .video, preferredTrackID: 1)!.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: vt[0], at: .zero)
  try comp.addMutableTrack(withMediaType: .audio, preferredTrackID: 2)!.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: at[0], at: .zero)
  let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!; ex.outputURL = out; ex.outputFileType = .mp4
  let s3 = DispatchSemaphore(value: 0); ex.exportAsynchronously { s3.signal() }; s3.wait()
  if ex.status != .completed { print("export failed", ex.error as Any); exit(1) }
  try? fm.removeItem(at: tmp); print("seconds", CMTimeGetSeconds(dur), "frames", names.count)
}
try run()
