# Attendance Handler v0.1.1 — Chrome shutdown fix

This patch fixes the dedicated Chrome process remaining open after its last window is closed. Quitting Attendance Handler now also closes its dedicated Chrome process. Other Chrome profiles are unaffected.

## Downloads

| System | Recommended download | Alternative |
| --- | --- | --- |
| Windows 10/11 x64 | [Windows installer (.exe)](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-win-x64-Setup.exe) | [ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-win-x64.zip) |
| macOS 13+, Apple Silicon and Intel | [Universal DMG](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-mac-universal.dmg) | [Universal ZIP](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/Attendance-Handler-0.1.1-mac-universal.zip) |

[SHA-256 checksums for all downloads](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.1/SHA256SUMS.txt). Download an application package above rather than GitHub's generated source archives.

## What changed

- Closing the last tab or window in the dedicated Chrome profile ends that Chrome process. If another tab is open, it stays open.
- **Log in** or **View classroom** reopens Chrome when needed. Monitoring pauses after the classroom window is closed and resumes on explicit reopening.
- Quitting Attendance Handler closes its dedicated Chrome. Closing only the App window still keeps the App running in the macOS menu bar or Windows system tray.

The existing attendance, answer, notification, and encrypted-session behavior is unchanged. Existing local course settings and the Chrome profile are retained when upgrading from v0.1.0.

## Installation and verification

Install Google Chrome first (`/Applications` on macOS). On macOS, open the DMG and replace the previous Attendance Handler in Applications. On Windows, run the installer; the ZIP must be fully extracted before use.

The fix passed 22 unit tests, 15 mock-classroom integration checks, a dedicated Chrome process lifecycle test, and a packaged macOS App smoke test. The Windows release workflow builds and tests its installer, Chrome integration, and packaged App before attaching Windows files. Tests use a local simulated classroom; live iClicker receipts remain unverified.

The Windows installer is unsigned. The macOS build is ad-hoc signed and not Apple-notarized, so first launch may require approval in System Settings → Privacy & Security. Physical Windows and Intel Mac testing remain pending.

[中文说明](https://github.com/tzuo5/attendance-handler/blob/main/docs/RELEASE-v0.1.1.zh-CN.md) · [Privacy boundary](https://github.com/tzuo5/attendance-handler/blob/main/PRIVACY.md)
