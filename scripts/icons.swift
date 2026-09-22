import AppKit
import Foundation

func render(_ size: Int, tray: Bool = false) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.current = context
    context.cgContext.scaleBy(x: CGFloat(size)/1024, y: CGFloat(size)/1024)
    if !tray {
        NSColor(calibratedRed: 0.14, green: 0.32, blue: 0.24, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 30, y: 30, width: 964, height: 964), xRadius: 225, yRadius: 225).fill()
        let text = "ah" as NSString
        text.draw(at: NSPoint(x: 163, y: 255), withAttributes: [.font: NSFont(name: "Georgia-BoldItalic", size: 475)!, .foregroundColor: NSColor(calibratedRed: 0.92, green: 0.94, blue: 0.83, alpha: 1)])
        NSColor(calibratedRed: 0.70, green: 0.79, blue: 0.54, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: 715, y: 745, width: 75, height: 75)).fill()
    } else {
        NSColor.black.setStroke()
        let path = NSBezierPath()
        path.move(to: NSPoint(x: 130, y: 790)); path.line(to: NSPoint(x: 350, y: 790)); path.curve(to: NSPoint(x: 512, y: 700), controlPoint1: NSPoint(x: 440, y: 790), controlPoint2: NSPoint(x: 480, y: 750))
        path.curve(to: NSPoint(x: 674, y: 790), controlPoint1: NSPoint(x: 544, y: 750), controlPoint2: NSPoint(x: 584, y: 790)); path.line(to: NSPoint(x: 894, y: 790)); path.line(to: NSPoint(x: 894, y: 245)); path.line(to: NSPoint(x: 674, y: 245)); path.curve(to: NSPoint(x: 512, y: 180), controlPoint1: NSPoint(x: 600, y: 245), controlPoint2: NSPoint(x: 552, y: 220)); path.curve(to: NSPoint(x: 350, y: 245), controlPoint1: NSPoint(x: 470, y: 220), controlPoint2: NSPoint(x: 424, y: 245)); path.line(to: NSPoint(x: 130, y: 245)); path.close()
        path.move(to: NSPoint(x: 512, y: 180)); path.line(to: NSPoint(x: 512, y: 700)); path.lineWidth = 64; path.lineJoinStyle = .round; path.lineCapStyle = .round; path.stroke()
    }
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}
let manager = FileManager.default
try manager.createDirectory(atPath: "build/AppIcon.iconset", withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    try render(size).write(to: URL(fileURLWithPath: "build/AppIcon.iconset/icon_\(size)x\(size).png"))
    try render(size * 2).write(to: URL(fileURLWithPath: "build/AppIcon.iconset/icon_\(size)x\(size)@2x.png"))
}
try render(36, tray: true).write(to: URL(fileURLWithPath: "dist-electron/tray.png"))
