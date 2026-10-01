import { readFile, writeFile, cp, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPOSITORY, assetNames, releaseBase, assertVersion, validateWindowsMetadata } from './release-metadata.mjs';
import { parse } from 'yaml';

export function manifestFromRelease(release) {
  if (release.draft || release.prerelease || !release.tag_name?.startsWith('v')) throw new Error('A published stable release is required');
  const version = release.tag_name.slice(1); assertVersion(version);
  if (!release.published_at || !Number.isFinite(Date.parse(release.published_at))) throw new Error('Invalid release publication date');
  const names = assetNames(version), assets = new Map(release.assets.map(asset => [asset.name, asset]));
  const url = name => {
    const asset = assets.get(name);
    if (!asset || asset.state !== 'uploaded' || asset.size <= 0 || asset.browser_download_url !== releaseBase(version) + name) throw new Error(`Missing or invalid release asset: ${name}`);
    return asset.browser_download_url;
  };
  for (const name of [...Object.values(names), 'SHA256SUMS.txt', 'SHA256SUMS-windows.txt']) url(name);
  const manifest = { schemaVersion: 1, version, publishedAt: release.published_at, releaseUrl: `https://github.com/${REPOSITORY}/releases/tag/v${version}`, downloads: { mac: url(names.mac), windows: url(names.windows) } };
  // Existing v0.1.1 predates the updater. All new releases must be complete.
  if (version !== '0.1.1') {
    url('appcast.xml'); url('latest.yml');
    manifest.updates = { macAppcast: url('appcast.xml'), windowsFeed: releaseBase(version) };
  }
  return manifest;
}
export async function buildSite({ release, destination = resolve('.site-build'), fetcher = fetch } = {}) {
  if (!release) {
    const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Cannot read the latest published release');
    release = await response.json();
  }
  const manifest = manifestFromRelease(release);
  let appcast, windowsMetadata;
  if (manifest.updates) {
    const responses = await Promise.all([fetcher(manifest.updates.macAppcast, { signal: AbortSignal.timeout(15000) }), fetcher(manifest.updates.windowsFeed + 'latest.yml', { signal: AbortSignal.timeout(15000) })]);
    if (responses.some(response => !response.ok)) throw new Error('Update feeds are not available yet');
    [appcast, windowsMetadata] = await Promise.all(responses.map(response => response.text()));
    validateWindowsMetadata(parse(windowsMetadata), manifest.version);
    if (!appcast.includes(`<sparkle:version>${manifest.version}</sparkle:version>`) || !appcast.includes(`url="${releaseBase(manifest.version)}${assetNames(manifest.version).macZip}"`) || !/sparkle:edSignature="[A-Za-z0-9+/=]{88}"/.test(appcast)) throw new Error('Invalid macOS update feed');
  }
  await rm(destination, { recursive: true, force: true });
  await cp(resolve('docs/site'), destination, { recursive: true });
  await mkdir(join(destination, 'assets'), { recursive: true });
  await cp(resolve('docs/assets/attendance-handler-icon.png'), join(destination, 'assets/icon.png'));
  await writeFile(join(destination, '.nojekyll'), '');
  await writeFile(join(destination, 'version.json'), JSON.stringify(manifest) + '\n');
  if (appcast) {
    await mkdir(join(destination, 'updates/windows'), { recursive: true });
    await writeFile(join(destination, 'updates/appcast.xml'), appcast);
    await writeFile(join(destination, 'updates/windows/latest.yml'), windowsMetadata);
  }
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--release-file');
  const release = index >= 0 ? JSON.parse(await readFile(process.argv[index + 1], 'utf8')) : undefined;
  const manifest = await buildSite({ release });
  console.log(`Website built for published v${manifest.version}`);
}
