# Attendance Handler v0.2.0 — Windows x64

The first Windows release of the visible-window iClicker classroom companion.

## Download and install

- **Attendance-Handler-0.2.0-win-x64-Setup.exe**: recommended installer for Windows 10/11 x64. Installs for the current user and creates Start menu and desktop shortcuts.
- **Attendance-Handler-0.2.0-win-x64.zip**: extract the entire archive, then open `Attendance Handler.exe`. Use the installer for Start menu registration and Windows notifications.
- **SHA256SUMS-windows.txt**: SHA-256 checksums for both downloads.

Google Chrome must be installed; Node.js is not required. The app finds both per-user and system-wide Chrome installations. Sign in through its dedicated Chrome window, then configure a course. Closing the app window keeps monitoring in the system tray. Double-click the tray icon to reopen the app; use its context menu to quit.

## Included

- Windows-native Chrome startup and explicit classroom window activation, with no simulated mouse or keyboard input.
- System tray, native Windows window controls, and notification identity.
- Login session encryption through Electron safeStorage / Windows DPAPI.
- The existing attendance, answer reminders, automatic A, minimized monitoring, deadlines, and local course storage.
- A reproducible Windows build workflow with source tests, simulated classroom integration, installer smoke checks, package privacy audit, ZIP verification, and checksums.

## Verification and limitations

Windows builds are validated on a GitHub-hosted Windows Server 2022 x64 runner. The 22 unit tests and 15 mock-classroom integration checks run there, followed by a silent installation and checks of the installed app's course persistence, Chrome connection, native helper, mock attendance, and OS-encrypted session storage. The ZIP's app archive is compared with the audited build. These automated checks do not replace testing on physical Windows 10/11 hardware.

This build is **unsigned**. Windows may show an unknown-publisher or SmartScreen prompt. Notification delivery, sounds, click-to-focus behavior, and focus rules depend on Windows settings and still require an interactive desktop check. The ZIP does not register a Start menu shortcut. Live iClicker attendance and answer receipts also remain pending classroom verification.

The existing [macOS universal release](https://github.com/tzuo5/attendance-handler/releases/tag/v0.1.0) remains available. This release adds Windows assets only.

[中文说明](https://github.com/tzuo5/attendance-handler/blob/v0.2.0/docs/RELEASE-v0.2.0.zh-CN.md) · [Privacy boundary](https://github.com/tzuo5/attendance-handler/blob/v0.2.0/PRIVACY.md)
