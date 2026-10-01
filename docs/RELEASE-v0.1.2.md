# Attendance Handler v0.1.2

Adds a free bilingual project website and application updates, alongside the classroom feedback, first-run setup, background monitoring, and scheduled starts developed since v0.1.1.

- Startup update checks run after the interface loads with a three-second deadline. A newer release prompts once per process start; tray reopening and hourly checks only update the download button.
- Clicking Download update downloads, verifies, installs, and restarts. Monitoring continues during download. Updating an active class requires confirmation; a newly started class requires confirmation again before installation.
- Windows NSIS installations use electron-updater. Writable macOS installations use Sparkle 2.10.0 with a fixed Ed25519 public key and a separate Universal update helper. Windows ZIP users update manually.
- The application identifier and user data directory remain unchanged, preserving courses, schedules, records, browser profiles, and encrypted login data.
- The website follows the latest published stable release and offers macOS Universal / Windows x64 downloads, installation help, privacy information, and Chinese / English switching.

v0.1.1 has no updater: install this version manually once. macOS requires macOS 13 or later; Windows requires Windows 10/11 x64; Google Chrome remains required. Free builds retain ad-hoc macOS signing and unsigned Windows installers. First installation or system permission checks may require confirmation; a macOS update may request Keychain access again.

Release preparation is gated on complete assets, matching versions, checksums, update signatures, and two-version native upgrade tests. Physical Intel Mac / Windows devices, real school login and live classroom acceptance remain separate verification boundaries. See [verification](../VERIFICATION.md) and [中文说明](RELEASE-v0.1.2.zh-CN.md).
