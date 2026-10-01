import AppKit
import Foundation
import Sparkle

// Separate from the Electron process so Sparkle can wait for it, replace it,
// and relaunch it. All choices come from the main-process update controller.
@MainActor final class UpdateDriver: NSObject, SPUUserDriver, SPUUpdaterDelegate {
    var updater: SPUUpdater!
    var cancellation: (() -> Void)?
    var readyReply: ((SPUUserUpdateChoice) -> Void)?
    var expected: UInt64 = 0
    var received: UInt64 = 0
    var installing = false
    var finished = false
    var cancelled = false
    let targetVersion: String
    let feed: URL
    init(targetVersion: String, feed: URL) { self.targetVersion = targetVersion; self.feed = feed }
    func feedURLString(for updater: SPUUpdater) -> String? { feed.absoluteString }
    func trace(_ message: String) {
        if ProcessInfo.processInfo.environment["ATTENDANCE_UPDATE_TEST"] == "1" {
            FileHandle.standardError.write(Data((message + "\n").utf8))
        }
    }
    func emit(_ event: String, _ fields: [String: Any] = [:]) {
        var message = fields; message["event"] = event
        if let data = try? JSONSerialization.data(withJSONObject: message) {
            FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10]))
        }
    }
    func fail(_ error: Error? = nil) { trace(error?.localizedDescription ?? "Update failed"); emit("error"); finished = true; exit(1) }
    func command(_ value: String) {
        if value == "install", let reply = readyReply {
            installing = true; readyReply = nil; reply(.install)
        } else if value == "cancel", !installing {
            cancelled = true
            if let reply = readyReply { readyReply = nil; reply(.skip) }
            else if let cancel = cancellation { cancel() }
        }
    }
    func show(_ request: SPUUpdatePermissionRequest, reply: @escaping (SUUpdatePermissionResponse) -> Void) {
        reply(SUUpdatePermissionResponse(automaticUpdateChecks: false, sendSystemProfile: false))
    }
    func showUserInitiatedUpdateCheck(cancellation: @escaping () -> Void) { trace("Checking feed"); self.cancellation = cancellation }
    func showUpdateFound(with appcastItem: SUAppcastItem, state: SPUUserUpdateState, reply: @escaping (SPUUserUpdateChoice) -> Void) {
        trace("Found " + appcastItem.versionString)
        guard appcastItem.versionString == targetVersion, !appcastItem.isInformationOnlyUpdate else { fail(); return }
        reply(.install)
    }
    func showUpdateReleaseNotes(with downloadData: SPUDownloadData) {}
    func showUpdateReleaseNotesFailedToDownloadWithError(_ error: Error) {}
    func showUpdateNotFoundWithError(_ error: Error, acknowledgement: @escaping () -> Void) { fail(error) }
    func showUpdaterError(_ error: Error, acknowledgement: @escaping () -> Void) { fail(error) }
    func showDownloadInitiated(cancellation: @escaping () -> Void) { trace("Downloading archive"); self.cancellation = cancellation }
    func showDownloadDidReceiveExpectedContentLength(_ length: UInt64) { expected = length }
    func showDownloadDidReceiveData(ofLength length: UInt64) {
        received += length
        if expected > 0 { emit("progress", ["percent": min(95, Double(received) / Double(expected) * 95)]) }
    }
    func showDownloadDidStartExtractingUpdate() { cancellation = nil; emit("progress", ["percent": 95]) }
    func showExtractionReceivedProgress(_ progress: Double) { emit("progress", ["percent": 95 + progress * 4]) }
    func showReady(toInstallAndRelaunch reply: @escaping (SPUUserUpdateChoice) -> Void) { if cancelled { reply(.skip) } else { readyReply = reply; emit("ready") } }
    func showInstallingUpdate(withApplicationTerminated applicationTerminated: Bool, retryTerminatingApplication: @escaping () -> Void) { emit("installing") }
    func showUpdateInstalledAndRelaunched(_ relaunched: Bool, acknowledgement: @escaping () -> Void) {
        acknowledgement(); finished = true; emit("installed", ["relaunched": relaunched]); exit(relaunched ? 0 : 1)
    }
    func dismissUpdateInstallation() { if !finished { finished = true; exit(0) } }
}

let arguments = CommandLine.arguments
guard arguments.count == 4, let host = Bundle(path: arguments[1]), let feed = URL(string: arguments[2]), feed.scheme == "https" || (ProcessInfo.processInfo.environment["ATTENDANCE_UPDATE_TEST"] == "1" && feed.host == "127.0.0.1") else { exit(1) }
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
DispatchQueue.main.async {
    let driver = UpdateDriver(targetVersion: arguments[3], feed: feed)
    driver.updater = SPUUpdater(hostBundle: host, applicationBundle: host, userDriver: driver, delegate: driver)
    do {
        driver.updater.automaticallyChecksForUpdates = false
        driver.updater.automaticallyDownloadsUpdates = false
        try driver.updater.start()
        driver.updater.checkForUpdates()
    } catch { driver.fail(error) }
    DispatchQueue.global().async {
        // readLine() holds stdin's C FILE lock while waiting. Foundation's XML
        // XPath parser also accesses that lock, which can deadlock the appcast.
        var buffer = ""
        while true {
            let data = FileHandle.standardInput.availableData
            if data.isEmpty { break }
            buffer += String(decoding: data, as: UTF8.self)
            if buffer.count > 8192 { break }
            while let newline = buffer.firstIndex(of: "\n") {
                let command = String(buffer[..<newline]); buffer.removeSubrange(...newline)
                DispatchQueue.main.async { driver.command(command) }
            }
        }
        DispatchQueue.main.async { if !driver.installing { driver.command("cancel") } }
    }
}
application.run()
