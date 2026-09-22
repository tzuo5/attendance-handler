import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
await mkdir('dist-electron', { recursive: true });
const exec = promisify(execFile);
const architectures = process.env.ATTENDANCE_UNIVERSAL === '1' ? ['arm64', 'x86_64'] : [process.arch === 'arm64' ? 'arm64' : 'x86_64'];
for (const architecture of architectures) {
  await mkdir(`build/native-${architecture}`, { recursive: true });
  await exec('/usr/bin/swiftc', ['-O', '-target', `${architecture}-apple-macos13.0`, 'scripts/native.swift', '-o', `build/native-${architecture}/attendance-native`]);
}
await exec('/usr/bin/lipo', ['-create', ...architectures.map(architecture => `build/native-${architecture}/attendance-native`), '-output', 'dist-electron/attendance-native']);
await promisify(execFile)('/usr/bin/swiftc', ['scripts/icons.swift', '-o', 'build/icon-maker']);
await promisify(execFile)('build/icon-maker');
await promisify(execFile)('/usr/bin/iconutil', ['-c', 'icns', 'build/AppIcon.iconset', '-o', 'build/icon.icns']);
await build({ entryPoints: ['src/main/index.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist-electron/main.cjs', external: ['electron', 'playwright-core'], sourcemap: false });
await build({ entryPoints: ['src/main/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: 'dist-electron/preload.cjs', external: ['electron'] });
