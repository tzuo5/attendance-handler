import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, writeFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';

export const REPOSITORY = 'tzuo5/attendance-handler';
export const releaseBase = version => `https://github.com/${REPOSITORY}/releases/download/v${version}/`;
export const assetNames = version => ({
  mac: `Attendance-Handler-${version}-mac-universal.dmg`,
  macZip: `Attendance-Handler-${version}-mac-universal.zip`,
  windows: `Attendance-Handler-${version}-win-x64-Setup.exe`,
  windowsZip: `Attendance-Handler-${version}-win-x64.zip`,
});
export function assertVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Only stable semantic versions can be published');
}
export function validateWindowsMetadata(metadata, version, bytes) {
  const expected = assetNames(version).windows;
  if (metadata.version !== version || metadata.path !== expected || !/^[A-Za-z0-9+/]{86}==$/.test(metadata.sha512 || '') || !Array.isArray(metadata.files) || metadata.files.length !== 1 ||
      metadata.files[0].url !== expected || metadata.files[0].sha512 !== metadata.sha512 || !Number.isSafeInteger(metadata.files[0].size) || metadata.files[0].size <= 0) throw new Error('Windows update metadata does not match the release');
  if (bytes && (createHash('sha512').update(bytes).digest('base64') !== metadata.sha512 || bytes.length !== metadata.files[0].size)) throw new Error('Windows update checksum mismatch');
}
export async function createWindowsMetadata(directory, version) {
  assertVersion(version);
  const name = assetNames(version).windows, bytes = await readFile(join(directory, name));
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const metadata = { version, files: [{ url: name, sha512, size: bytes.length }], path: name, sha512, releaseDate: new Date().toISOString() };
  // electron-builder merges ZIP and NSIS entries; only the NSIS installer is
  // eligible for this update channel. ZIP users retain the manual download.
  await writeFile(join(directory, 'latest.yml'), stringify(metadata));
}
export function validateMacSignature(bytes, signature, publicKey) {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature) || Buffer.from(publicKey, 'base64').length !== 32) throw new Error('Invalid macOS update signature');
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64')]), format: 'der', type: 'spki' });
  if (!verify(null, bytes, key, Buffer.from(signature, 'base64'))) throw new Error('macOS update signature does not match the embedded public key');
}
async function signingPublicKey() {
  return JSON.parse(await readFile(resolve('package.json'), 'utf8')).build.mac.extendInfo.SUPublicEDKey;
}
export async function createMacMetadata(directory, version) {
  assertVersion(version);
  if (process.env.GITHUB_ACTIONS === 'true' && !process.env.ATTENDANCE_SPARKLE_PRIVATE_KEY) throw new Error('Configure the ATTENDANCE_SPARKLE_PRIVATE_KEY Actions secret before publishing macOS updates');
  const name = assetNames(version).macZip, archive = join(directory, name);
  const signingArguments = ['--account', 'com.attendancehandler.updates'];
  let secureDirectory;
  try {
    if (process.env.ATTENDANCE_SPARKLE_PRIVATE_KEY) {
      secureDirectory = await mkdtemp(join(tmpdir(), 'attendance-signing-'));
      const keyFile = join(secureDirectory, 'signing.key');
      await writeFile(keyFile, process.env.ATTENDANCE_SPARKLE_PRIVATE_KEY, { mode: 0o600 });
      signingArguments.splice(0, signingArguments.length, '--ed-key-file', keyFile);
    }
    const { stdout } = await promisify(execFile)(resolve('build/sparkle/bin/sign_update'), [...signingArguments, archive]);
    const signature = stdout.match(/sparkle:edSignature="([A-Za-z0-9+/=]+)"/)?.[1];
    if (!signature) throw new Error('Sparkle signing did not produce a signature');
    validateMacSignature(await readFile(archive), signature, await signingPublicKey());
    const size = (await stat(archive)).size;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Attendance Handler updates</title><item><title>Attendance Handler ${version}</title><sparkle:version>${version}</sparkle:version><sparkle:shortVersionString>${version}</sparkle:shortVersionString><sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion><enclosure url="${releaseBase(version)}${name}" sparkle:edSignature="${signature}" length="${size}" type="application/octet-stream"/></item></channel></rss>\n`;
    await writeFile(join(directory, 'appcast.xml'), xml);
    const checksums = [];
    for (const name of [assetNames(version).mac, assetNames(version).macZip]) {
      checksums.push(`${createHash('sha256').update(await readFile(join(directory, name))).digest('hex')}  ${name}`);
    }
    await writeFile(join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  } finally { if (secureDirectory) await rm(secureDirectory, { recursive: true, force: true }); }
}
export async function validateReleaseDirectory(directory, version) {
  assertVersion(version);
  for (const name of [...Object.values(assetNames(version)), 'latest.yml', 'appcast.xml', 'SHA256SUMS.txt', 'SHA256SUMS-windows.txt']) {
    if ((await stat(join(directory, name))).size <= 0) throw new Error(`Empty release asset: ${name}`);
  }
  validateWindowsMetadata(parse(await readFile(join(directory, 'latest.yml'), 'utf8')), version, await readFile(join(directory, assetNames(version).windows)));
  const appcast = await readFile(join(directory, 'appcast.xml'), 'utf8');
  const archive = join(directory, assetNames(version).macZip);
  if (!appcast.includes(`<sparkle:version>${version}</sparkle:version>`) || !appcast.includes(`url="${releaseBase(version)}${assetNames(version).macZip}"`) || !appcast.includes(`length="${(await stat(archive)).size}"`) || !/sparkle:edSignature="[A-Za-z0-9+/=]{88}"/.test(appcast)) throw new Error('macOS update metadata does not match the release');
  validateMacSignature(await readFile(archive), appcast.match(/sparkle:edSignature="([^"]+)"/)[1], await signingPublicKey());
  const checked = new Set();
  for (const name of ['SHA256SUMS.txt', 'SHA256SUMS-windows.txt']) {
    const lines = (await readFile(join(directory, name), 'utf8')).trim().split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})  (Attendance-Handler-[A-Za-z0-9.-]+)$/);
      if (!match || !Object.values(assetNames(version)).includes(match[2]) || checked.has(match[2]) || createHash('sha256').update(await readFile(join(directory, match[2]))).digest('hex') !== match[1]) throw new Error('Release checksum mismatch');
      checked.add(match[2]);
    }
  }
  if (checked.size !== Object.values(assetNames(version)).length) throw new Error('Release checksums must cover every installer and archive');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const directory = resolve('release-public');
  if (process.argv.includes('--validate')) await validateReleaseDirectory(directory, version);
  else if (process.argv.includes('--windows')) await createWindowsMetadata(directory, version);
  else await createMacMetadata(directory, version);
  console.log(`Release metadata ${process.argv.includes('--validate') ? 'validated' : 'signed'} for v${version}`);
}
