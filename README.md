<div align="center">
  <img src="docs/assets/attendance-handler-icon.png" width="96" height="96" alt="Attendance Handler icon" />
  <h1>Attendance Handler</h1>
  <p><strong>A local-first Windows and macOS classroom companion for iClicker.</strong><br />Keep the real classroom window visible while monitoring runs quietly in the background.</p>
  <p>
    <a href="https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.dmg"><strong>Download for macOS</strong></a>
    ·
    <a href="https://github.com/tzuo5/attendance-handler/releases/download/v0.2.0/Attendance-Handler-0.2.0-win-x64-Setup.exe"><strong>Download for Windows</strong></a>
    ·
    <a href="https://github.com/tzuo5/attendance-handler/releases">All releases</a>
    ·
    <a href="README.zh-CN.md">中文说明</a>
  </p>
</div>

<p align="center">
  <a href="https://github.com/tzuo5/attendance-handler/actions/workflows/ci.yml"><img src="https://github.com/tzuo5/attendance-handler/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status" /></a>
  <a href="https://github.com/tzuo5/attendance-handler/releases/latest"><img src="https://img.shields.io/github/v/release/tzuo5/attendance-handler?display_name=tag&style=flat-square&color=0f766e" alt="Latest release" /></a>
  <img src="https://img.shields.io/badge/macOS-13%2B-111827?style=flat-square&logo=apple&logoColor=white" alt="macOS 13 or later" />
  <img src="https://img.shields.io/badge/Universal-arm64%20%2B%20x64-0f766e?style=flat-square" alt="Apple Silicon and Intel" />
</p>

> **Preview release** — This project is designed for personal, local use. The simulated classroom flow is tested; final verification against a live iClicker class is still pending. Use it only where your course policy permits.

## What it does

Attendance Handler turns a repetitive classroom setup into one visible, supervised session:

| | Capability | What to expect |
| --- | --- | --- |
| ◉ | **Visible Chrome** | A dedicated Chrome profile stays open and usable. Monitoring continues when the window is covered or minimized. |
| ✓ | **Attendance** | Applies the saved location, opens the course, joins when available, and waits for a confirmed attendance state. |
| A | **Automatic A** | For eligible open single-choice polls, selects A once and waits for the website receipt. Existing answers are never overwritten. |
| ♧ | **Answer reminders** | For accuracy-sensitive courses or unsupported question types, sends a notification immediately and repeats every 30 seconds until the question is resolved. |
| ⏱ | **Session watchdog** | Checks every 5 seconds, uses the configured duration as a hard deadline, backs off during network failures, and keeps the computer awake without preventing the display from sleeping. |
| ◎ | **Local-first storage** | Courses stay on your computer. Login session storage is encrypted with Electron `safeStorage`; passwords are never stored. |

## The classroom flow

```text
Configure a course
        ↓
Start session → dedicated Chrome + location override
        ↓
Wait for class / confirm attendance
        ↓
Poll the existing page every 5 seconds
        ├─ eligible single-choice → select A → verify receipt
        └─ manual-answer mode     → notify → user clicks to return
        ↓
Deadline or “End class” → stop checks, reminders, and location override
```

Automatic actions run through the page and CDP connection. They do not simulate system mouse or keyboard input and do not activate the frontmost app. Only an explicit **Log in**, **View classroom**, or notification click brings the dedicated Chrome window forward.

## Download and install

### Windows 10/11 (64-bit)

1. Download the [Windows installer](https://github.com/tzuo5/attendance-handler/releases/download/v0.2.0/Attendance-Handler-0.2.0-win-x64-Setup.exe) and install for your Windows user.
2. Install Google Chrome, then launch **Attendance Handler** from the Start menu. Node.js is not required.
3. Sign in using the dedicated Chrome window and configure your course. Closing the app window keeps monitoring in the system tray; double-click the tray icon to reopen it.

A [ZIP version](https://github.com/tzuo5/attendance-handler/releases/download/v0.2.0/Attendance-Handler-0.2.0-win-x64.zip) is also available: extract the entire folder and run `Attendance Handler.exe`. Use the installer for Start menu registration and Windows notifications. [Windows SHA-256 checksums](https://github.com/tzuo5/attendance-handler/releases/download/v0.2.0/SHA256SUMS-windows.txt) are included. The Windows build is unsigned, so Windows may show an unknown-publisher or SmartScreen prompt.

### macOS

1. Download the [universal DMG](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.dmg). It runs on macOS 13+ with Apple Silicon or Intel.
2. Open it and drag **Attendance Handler** into **Applications**.
3. Launch it from Applications. Google Chrome must already be installed in `/Applications`; Node.js is not required.
4. Complete iClicker sign-in and any school verification in the dedicated Chrome window, then import or configure a course.

The release also includes a [ZIP fallback](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/Attendance-Handler-0.1.0-mac-universal.zip) and [SHA-256 checksums](https://github.com/tzuo5/attendance-handler/releases/download/v0.1.0/SHA256SUMS.txt).

### Gatekeeper notice

`v0.1.0` is ad-hoc signed and not notarized with Apple. macOS may require a one-time manual approval in **System Settings → Privacy & Security** after you confirm that the download came from this release. Do not disable macOS security globally, and do not bypass a damaged-app or malware warning. A future Developer ID + notarized build can remove this first-launch warning.

## Build from source

Requirements: Node.js 22.12+ and Google Chrome. On macOS, install Apple Command Line Tools and Chrome in `/Applications`. On Windows x64, the build uses the .NET Framework C# compiler included with Windows; install Chrome for your user or all users.

```sh
npm install
npm run dev                 # local app development
npm test                    # unit tests
npm run test:integration    # isolated mock Chrome classroom
npm run audit:public        # public-data allowlist and secret scan
npm run dist:mac            # on macOS: universal DMG + ZIP in release-public/
npm run dist:win            # on Windows: x64 installer + ZIP in release-public/
```

`npm run demo` starts a completely local classroom simulator. It never contacts real iClicker and uses synthetic course data and coordinates. The integration suite uses a temporary Chrome profile and never touches a daily Chrome session.

## Privacy boundary

The public repository and release artifacts do not contain personal courses, real course IDs, coordinates, credentials, tokens, browser profiles, run logs, or personal screenshots. The app stores user-entered course coordinates locally because the classroom site needs them; the course list only displays **Location configured** instead of exposing them at a glance.

Read the full [privacy and release boundary](PRIVACY.md) before sharing diagnostics. The public-data audit is part of the build workflow, but you should still review any file before attaching it to an issue.

## Project layout

```text
src/main/browser.ts        dedicated Chrome, CDP, geolocation, encrypted session
src/main/iclicker.ts       page snapshots, passive evidence, safe answer actions
src/main/watchdog.ts       5-second checks, deadlines, retries, reminders
src/renderer/              React + TypeScript desktop UI
scripts/mock-classroom.mjs local classroom simulator
tests/                     unit coverage for watchdog and page evidence
```

See [verification notes](VERIFICATION.md), the [Windows release notes](docs/RELEASE-v0.2.0.md), and the [macOS release notes](docs/RELEASE-v0.1.0.md) for tested behavior and known limits.

## License and status

This repository is an early preview and does not currently declare an open-source license. All rights remain with the author. Contributions and bug reports are welcome, but please never include login tokens, course coordinates, screenshots with personal data, or raw browser profiles.

<div align="center">
  <sub>Built for a calmer classroom workflow · Windows + macOS · Electron · React · TypeScript</sub>
</div>
