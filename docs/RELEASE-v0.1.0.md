# Attendance Handler v0.1.0 — macOS + Windows

A local-first iClicker classroom companion for both platforms, with a visible dedicated Chrome window.

## Downloads

| System | Recommended download | Alternative |
| --- | --- | --- |
| Windows 10/11 x64 | [Windows installer (.exe)](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-win-x64-Setup.exe) | [ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-win-x64.zip) |
| macOS 13+, Apple Silicon and Intel | [Universal DMG](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.dmg) | [Universal ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.zip) |

[SHA-256 checksums for all downloads](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/SHA256SUMS.txt). Download an application package above, rather than GitHub's generated source-code archives.

## Installation

- **Windows:** run the installer and launch Attendance Handler from the Start menu. The ZIP must be extracted completely before opening `Attendance Handler.exe`; use the installer for Start menu registration and system notifications.
- **macOS:** open the DMG and drag Attendance Handler into Applications, then launch it from there.
- Install Google Chrome first (in `/Applications` on macOS). Node.js is not required. Sign in and complete school verification in the app's dedicated Chrome window, then configure a course.

Closing the app window keeps monitoring in the macOS menu bar or Windows system tray. Use its menu to quit; on Windows, double-click the tray icon to reopen the app.

## Included

- Local course configuration, 5-second monitoring, deadlines, and idle-sleep prevention.
- Attendance confirmation, automatic A for recognized single-choice polls, and manual-answer reminders.
- A dedicated Chrome profile that continues monitoring while minimized, with explicit classroom window restoration.
- Encrypted login session storage via Electron safeStorage: macOS Keychain or Windows DPAPI. Passwords are not stored.
- Both application builds, their displayed versions, and their download filenames use **v0.1.0**.

## Verification and limitations

The Windows workflow runs 22 unit tests and 15 mock-classroom integration checks, installs the final installer, and checks course persistence, Chrome connection, the native helper, mock attendance, OS encryption, and graceful application exit. It also audits packaged files and verifies the ZIP. The hosted test environment is Windows Server 2022 x64; physical Windows 10/11 testing remains pending.

The macOS universal build contains Apple Silicon and Intel code. macOS runtime checks are performed on Apple Silicon; physical Intel testing remains pending. Both packages are checked for their embedded version and public-data boundary.

The Windows build is **unsigned**, so Windows may display an unknown-publisher or SmartScreen prompt. The macOS build is ad-hoc signed and **not notarized by Apple**; first launch may require approval in System Settings → Privacy & Security. Notification sounds, notification click-to-focus, sleep/wake behavior, and live iClicker attendance and answer receipts still require interactive verification. This preview is not a substitute for confirming a live classroom receipt.

[中文说明](https://github.com/tzuo5/attendance-handler/blob/main/docs/RELEASE-v0.1.0.zh-CN.md) · [Privacy boundary](https://github.com/tzuo5/attendance-handler/blob/main/PRIVACY.md) · [Verification notes](https://github.com/tzuo5/attendance-handler/blob/main/VERIFICATION.md)
