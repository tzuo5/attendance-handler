import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
await mkdir('dist-electron', { recursive: true });
const exec = promisify(execFile);
if (process.platform === 'darwin') {
  const architectures = process.env.ATTENDANCE_UNIVERSAL === '1' ? ['arm64', 'x86_64'] : [process.arch === 'arm64' ? 'arm64' : 'x86_64'];
  for (const architecture of architectures) {
    await mkdir(`build/native-${architecture}`, { recursive: true });
    await exec('/usr/bin/swiftc', ['-O', '-target', `${architecture}-apple-macos13.0`, 'scripts/native.swift', '-o', `build/native-${architecture}/attendance-native`]);
  }
  await exec('/usr/bin/lipo', ['-create', ...architectures.map(architecture => `build/native-${architecture}/attendance-native`), '-output', 'dist-electron/attendance-native']);
  await promisify(execFile)('/usr/bin/swiftc', ['scripts/icons.swift', '-o', 'build/icon-maker']);
  await promisify(execFile)('build/icon-maker');
  await promisify(execFile)('/usr/bin/iconutil', ['-c', 'icns', 'build/AppIcon.iconset', '-o', 'build/icon.icns']);
} else if (process.platform === 'win32') {
  const compiler = join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  await exec(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${resolve('dist-electron/attendance-native.exe')}`, resolve('scripts/native-windows.cs')], { windowsHide: true });
  await copyFile('docs/assets/attendance-handler-icon.png', 'dist-electron/tray.png');
} else {
  throw new Error('Desktop builds require macOS or Windows.');
}
await copyFile('docs/assets/attendance-handler-icon.png', 'dist-electron/icon.png');
await build({ entryPoints: ['src/main/index.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist-electron/main.cjs', external: ['electron', 'playwright-core'], sourcemap: false });
await build({ entryPoints: ['src/main/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist-electron/preload.cjs', external: ['electron'] });
