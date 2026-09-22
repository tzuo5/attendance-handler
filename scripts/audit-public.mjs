import { execFileSync } from 'node:child_process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';

// Print filenames/rule names only, never a matching secret or personal value.
const failures = [];
const rules = [
  ['private home path', /\/(?:Users|home)\/[A-Za-z0-9._-]+\//],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['JWT credential', /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/],
  ['precise coordinate pair', /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/],
];
const forbiddenPath = /(?:^|\/)(?:\.env(?:\..*)?|chrome-profile|user-data|\.demo-data|\.test-artifacts|state\.json|session\.enc(?:\.tmp)?|Cookies|Login Data|History|storageState[^/]*\.json|cookies[^/]*\.json)(?:\/|$)|\.(?:p12|pfx|pem|key|mobileprovision|log)$/i;
function inspect(name, bytes, ownSource = true) {
  if (forbiddenPath.test(name)) failures.push([name, 'private data path']);
  if (!ownSource) return;
  const content = bytes.toString('utf8');
  for (const [rule, pattern] of rules) if (pattern.test(content)) failures.push([name, rule]);
  for (const match of content.matchAll(/\b(?:latitude|longitude)\s*:\s*(-?\d+(?:\.\d+)?)/g)) {
    if (Number(match[1]) !== 0) failures.push([name, 'non-synthetic hard-coded coordinate']);
  }
}

const appIndex = process.argv.indexOf('--app');
let inspected = 0;
if (appIndex >= 0) {
  if (!process.argv[appIndex + 1]) throw new Error('--app requires an app bundle path');
  const directory = resolve(process.argv[appIndex + 1]);
  const { listPackage, extractFile } = await import('@electron/asar');
  const archive = join(directory, process.platform === 'win32' ? 'resources/app.asar' : 'Contents/Resources/app.asar');
  const files = listPackage(archive).map(name => name.replace(/\\/g, '/').replace(/^\//, ''));
  for (const name of files) {
    if (forbiddenPath.test(name)) failures.push([name, 'private data path']);
    if (!/^(?:dist\/|dist-electron\/|node_modules\/|package\.json$)/.test(name) && !['dist', 'dist-electron', 'node_modules'].includes(name)) failures.push([name, 'unexpected archive path']);
    if (/^(?:dist\/.*\.(?:js|css|html)|dist-electron\/.*\.cjs|package\.json)$/.test(name)) {
      inspect(name, extractFile(archive, name)); inspected++;
    }
    if (name.endsWith('.map') && !name.startsWith('node_modules/')) failures.push([name, 'source map in release']);
  }
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      const name = relative(directory, file).replace(/\\/g, '/');
      if (forbiddenPath.test(name)) failures.push([name, 'private data path']);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && (name.endsWith('attendance-native') || name.endsWith('Info.plist'))) {
        inspect(name, await readFile(file)); inspected++;
      }
    }
  }
  await walk(directory);
} else {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  if (!files.length) throw new Error('No tracked files: stage the public allowlist before auditing.');
  const rootFiles = new Set(['.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'README.md', 'README.zh-CN.md', 'VERIFICATION.md', 'PRIVACY.md']);
  for (const name of files) {
    if (!rootFiles.has(name) && !/^(?:src\/|tests\/|scripts\/|docs\/|\.github\/workflows\/)/.test(name) && name !== 'build/entitlements.mac.plist') failures.push([name, 'not in public source allowlist']);
    if ((await lstat(name)).isSymbolicLink()) failures.push([name, 'symlink not permitted']);
    inspect(name, await readFile(name)); inspected++;
  }
}
if (failures.length) {
  for (const [file, rule] of failures) console.error(`${file}: ${rule}`);
  process.exitCode = 1;
} else console.log(`Public-data audit passed (${inspected} files inspected).`);
