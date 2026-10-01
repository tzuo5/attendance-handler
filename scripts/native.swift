import AppKit
import Foundation
import CoreGraphics

let arguments = CommandLine.arguments
if arguments.count > 1 && arguments[1] == "frontmost" {
    if let application = NSWorkspace.shared.frontmostApplication {
        let result: [String: Any] = ["pid": Int(application.processIdentifier), "name": application.localizedName ?? "", "bundleId": application.bundleIdentifier ?? ""]
        let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        print(String(data: data, encoding: .utf8)!)
    }
} else if arguments.count == 3 && arguments[1] == "visible-windows", let pid = Int32(arguments[2]), pid > 0 {
    guard let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
        fputs("Window visibility inspection unavailable\n", stderr)
        exit(1)
    }
    let count = windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid && ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 }.count
    print("{\"count\":\(count)}")
} else if arguments.count > 2 && arguments[1] == "activate", let pid = Int32(arguments[2]), let application = NSRunningApplication(processIdentifier: pid) {
    application.activate(options: [.activateAllWindows])
} else {
    fputs("Usage: attendance-native frontmost | visible-windows <pid> | activate <pid>\n", stderr)
    exit(1)
}
