import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
// Build/release tools intentionally run as plain Node ESM outside the desktop bundle.
// @ts-expect-error JavaScript build-tool module.
import { manifestFromRelease } from '../scripts/build-site.mjs';
// @ts-expect-error JavaScript build-tool module.
import { assetNames, createWindowsMetadata, validateWindowsMetadata, validateMacSignature } from '../scripts/release-metadata.mjs';
function release(version = '0.1.2') {
  const names = [...Object.values(assetNames(version)).map(String), 'SHA256SUMS.txt', 'SHA256SUMS-windows.txt', 'latest.yml', 'appcast.xml'];
  return { tag_name: 'v' + version, draft: false, prerelease: false, published_at: '2026-10-01T12:00:00Z', assets: names.map(name => ({ name, state: 'uploaded', size: 100, browser_download_url: `https://github.com/tzuo5/attendance-handler/releases/download/v${version}/${name}` })) };
}
describe('published website and update assets', () => {
  it('uses the same release for website downloads and both immutable update feeds', () => {
    const manifest = manifestFromRelease(release()); expect(manifest.version).toBe('0.1.2'); expect(manifest.updates.macAppcast).toContain('/v0.1.2/appcast.xml'); expect(manifest.updates.windowsFeed).toContain('/v0.1.2/');
  });
  it('does not deploy a half-uploaded release or a draft/prerelease', () => {
    expect(() => manifestFromRelease({ ...release(), draft: true })).toThrow(); expect(() => manifestFromRelease({ ...release(), prerelease: true })).toThrow();
    const incomplete = release(); incomplete.assets.pop(); expect(() => manifestFromRelease(incomplete)).toThrow(/appcast/);
    const noWindows = release(); noWindows.assets = noWindows.assets.filter(asset => !asset.name.endsWith('Setup.exe')); expect(() => manifestFromRelease(noWindows)).toThrow();
  });
  it('can introduce the website using existing v0.1.1 without falsely advertising auto-updates', () => {
    const previous = release('0.1.1'); previous.assets = previous.assets.filter(asset => !['appcast.xml', 'latest.yml'].includes(asset.name));
    expect(manifestFromRelease(previous).updates).toBeUndefined();
  });
  it('validates the Windows installer checksum and version before publication', () => {
    const bytes = Buffer.from('synthetic installer'); const hash = createHash('sha512').update(bytes).digest('base64'), name = assetNames('0.1.2').windows;
    const metadata = { version: '0.1.2', path: name, sha512: hash, files: [{ url: name, sha512: hash, size: bytes.length }] };
    expect(() => validateWindowsMetadata(metadata, '0.1.2', bytes)).not.toThrow(); expect(() => validateWindowsMetadata(metadata, '0.1.2', Buffer.from('tampered'))).toThrow(/checksum/); expect(() => validateWindowsMetadata(metadata, '0.1.3', bytes)).toThrow();
    expect(() => validateWindowsMetadata({ ...metadata, sha512: undefined, files: [{ ...metadata.files[0], sha512: undefined }] }, '0.1.2')).toThrow();
  });
  it('removes ZIP entries from the Windows feed and hashes the actual NSIS installer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'attendance-feed-test-'));
    try {
      const bytes = Buffer.from('synthetic NSIS installer');
      await writeFile(join(directory, assetNames('0.1.2').windows), bytes);
      await writeFile(join(directory, 'latest.yml'), 'version: 0.1.2\npath: obsolete.zip\nfiles:\n  - url: obsolete.zip\n');
      await createWindowsMetadata(directory, '0.1.2');
      const metadata = parse(await readFile(join(directory, 'latest.yml'), 'utf8'));
      expect(metadata.files).toHaveLength(1);
      expect(() => validateWindowsMetadata(metadata, '0.1.2', bytes)).not.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('rejects a macOS archive signed with another key or modified after signing', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const bytes = Buffer.from('synthetic archive'), signature = sign(null, bytes, privateKey).toString('base64');
    const key = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    expect(() => validateMacSignature(bytes, signature, key)).not.toThrow();
    expect(() => validateMacSignature(Buffer.from('tampered'), signature, key)).toThrow(/signature/);
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    expect(() => validateMacSignature(bytes, signature, other)).toThrow(/public key/);
  });
});
