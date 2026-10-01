import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
export const SPARKLE_VERSION = '2.10.0';
const digest = 'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c';
export async function prepareSparkle(architectures) {
  const directory = resolve('build/sparkle'); await mkdir(directory, { recursive: true });
  const archive = join(directory, `Sparkle-${SPARKLE_VERSION}.tar.xz`);
  let bytes;
  try { bytes = await readFile(archive); } catch {
    const response = await fetch(`https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Sparkle download failed');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Sparkle archive checksum mismatch');
  await writeFile(archive, bytes);
  const exec = promisify(execFile);
  await exec('/usr/bin/tar', ['-xJf', archive, '-C', directory]);
  const helper = resolve('dist-electron/Attendance Updater.app/Contents');
  await rm(resolve('dist-electron/Attendance Updater.app'), { recursive: true, force: true });
  await mkdir(join(helper, 'MacOS'), { recursive: true }); await mkdir(join(helper, 'Frameworks'), { recursive: true });
  await mkdir(join(helper, 'Resources'), { recursive: true });
  await cp(join(directory, 'LICENSE'), join(helper, 'Resources/Sparkle-LICENSE.txt'));
  await cp(join(directory, 'Sparkle.framework'), join(helper, 'Frameworks/Sparkle.framework'), { recursive: true, verbatimSymlinks: true });
  const binaries = [];
  for (const architecture of architectures) {
    const destination = resolve(`build/update-helper-${architecture}`); await mkdir(destination, { recursive: true });
    const binary = join(destination, 'attendance-updater'); binaries.push(binary);
    await exec('/usr/bin/swiftc', ['-O', '-module-cache-path', resolve('build/swift-module-cache'), '-target', `${architecture}-apple-macos13.0`, '-F', directory, '-framework', 'Sparkle', '-Xlinker', '-rpath', '-Xlinker', '@executable_path/../Frameworks', 'scripts/update-helper.swift', '-o', binary]);
  }
  await exec('/usr/bin/lipo', ['-create', ...binaries, '-output', join(helper, 'MacOS/attendance-updater')]);
  await writeFile(join(helper, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.attendancehandler.updater</string><key>CFBundleName</key><string>Attendance Updater</string><key>CFBundleExecutable</key><string>attendance-updater</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string></dict></plist>`);
  await exec('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', 'build/entitlements.mac.plist', join(helper, 'MacOS/attendance-updater')]);
  await exec('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', 'build/entitlements.mac.plist', resolve('dist-electron/Attendance Updater.app')]);
}
