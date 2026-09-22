# Attendance Handler v0.1.0

macOS classroom companion with a visible, controllable iClicker Chrome window.

## Download and install

1. Download **Attendance-Handler-0.1.0-mac-universal.dmg** below. Do not choose GitHub's generated “Source code” archive.
2. Open the DMG and drag **Attendance Handler** to **Applications**.
3. macOS 13 or later is required. The package supports Apple Silicon and Intel. Install Google Chrome in `/Applications`; Node.js is not required.
4. Complete iClicker sign-in, school verification, and notification permission on first launch. No account, course, or location is bundled.

ZIP is available as a fallback. `SHA256SUMS.txt` contains the artifact checksums.

## Signing status

This build is ad-hoc signed and **not notarized by Apple**. Gatekeeper may require a one-time manual approval. After confirming the source, use **System Settings → Privacy & Security** to allow the app. Do not disable macOS security globally, and never bypass a damaged-app or malware warning.

A future Developer ID + notarized build can remove this first-launch warning. This package contains no installer script and does not change system security settings.

## Included

- Local course configuration, 5-second checks, and one active classroom session.
- A visible dedicated Chrome profile that continues monitoring while minimized.
- Automatic A for recognized live single-choice polls, with receipt confirmation.
- Manual-answer reminders immediately and every 30 seconds while a question remains open.
- Menu-bar operation, idle-sleep prevention, and cleanup of the location override at the deadline.
- Encrypted login session storage without saving passwords.

## Verification and limitations

The repository has 22 unit tests and 15 local mock-classroom integration checks. The packaged app, macOS notification delivery, DMG layout, universal architectures, and public-data audit were verified on Apple Silicon. The universal Intel slice is cross-compiled and has not been tested on physical Intel hardware.

Live iClicker attendance and answer receipts still require final classroom verification. Website changes can affect page recognition. Use the first live session with manual confirmation and do not rely on this preview as the sole attendance safeguard.

[中文说明](RELEASE-v0.1.0.zh-CN.md) · [Privacy boundary](../PRIVACY.md) · [Project README](../README.md)
