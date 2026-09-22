import AppKit
import Foundation

let arguments = CommandLine.arguments
if arguments.count > 1 && arguments[1] == "frontmost" {
    if let application = NSWorkspace.shared.frontmostApplication {
        let result: [String: Any] = ["pid": Int(application.processIdentifier), "name": application.localizedName ?? "", "bundleId": application.bundleIdentifier ?? ""]
        let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        print(String(data: data, encoding: .utf8)!)
    }
} else if arguments.count > 2 && arguments[1] == "activate", let pid = Int32(arguments[2]), let application = NSRunningApplication(processIdentifier: pid) {
    application.activate(options: [.activateAllWindows])
} else {
    fputs("Usage: attendance-native frontmost | activate <pid>\n", stderr)
    exit(1)
}
