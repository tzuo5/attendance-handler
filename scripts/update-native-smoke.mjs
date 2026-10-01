import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, stat, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { build, Platform, Arch } from 'electron-builder';
import { _electron as electron } from 'playwright-core';
import { parse } from 'yaml';
import { createMockClassroom } from './mock-classroom.mjs';
import { assetNames, releaseBase } from './release-metadata.mjs';

assert.ok(['darwin', 'win32'].includes(process.platform), 'Native update tests require macOS or Windows');
const exec = promisify(execFile), root = await mkdtemp(join(tmpdir(), 'attendance-update-install-'));
const data = join(root, 'user-data'); await mkdir(data);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const mock = await createMockClassroom();
let application, badUpdate = false, latestVersion = '99.0.0', relaunchedPid, oldPid;
const next = '99.0.1', downloads = new Map();
const manifest = version => ({ schemaVersion: 1, version, publishedAt: '2026-10-01T12:00:00Z', releaseUrl: `https://github.com/tzuo5/attendance-handler/releases/tag/v${version}`, downloads: { mac: releaseBase(version) + assetNames(version).mac, windows: releaseBase(version) + assetNames(version).windows }, updates: { macAppcast: releaseBase(version) + 'appcast.xml', windowsFeed: releaseBase(version) } });
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/version.json') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(manifest(latestVersion))); return; }
    if (request.url === '/appcast.xml') { response.setHeader('Content-Type', 'application/xml'); response.end(badUpdate ? appcast.replace(/sparkle:edSignature="(.)/, (_, first) => `sparkle:edSignature="${first === 'A' ? 'B' : 'A'}`) : appcast); return; }
    if (request.url === '/latest.yml') { response.end(badUpdate ? windowsYaml.replace(/sha512: [^\n]+/g, 'sha512: invalid') : windowsYaml); return; }
    const path = downloads.get(decodeURIComponent(request.url?.split('?')[0] || ''));
    if (!path) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Length', (await stat(path)).size); createReadStream(path).pipe(response);
  } catch { response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const feed = `http://127.0.0.1:${server.address().port}/`;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicBytes = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
const seedFile = join(root, 'test-signing.key');
await writeFile(seedFile, privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32).toString('base64'), { mode: 0o600 });
let appcast = '', windowsYaml = '';
try {
  const platform = process.platform === 'darwin' ? Platform.MAC : Platform.WINDOWS;
  for (const version of ['99.0.0', next]) {
    await build({ targets: platform.createTarget(process.platform === 'darwin' ? ['dir'] : ['nsis'], process.platform === 'darwin' ? Arch.universal : Arch.x64), config: {
      appId: 'com.attendancehandler.updatetest',
      directories: { output: join(root, version) },
      extraMetadata: { name: 'attendance-handler-update-test', version, attendanceUpdateTest: { dataDir: data, origin: mock.origin, feed } },
      mac: { extendInfo: { ...pkg.build.mac.extendInfo, SUPublicEDKey: publicBytes } },
      nsis: { createDesktopShortcut: false, createStartMenuShortcut: false },
    } });
  }
  let executable;
  if (process.platform === 'darwin') {
    const oldBundle = join(root, '99.0.0/mac-universal/Attendance Handler.app');
    const newBundle = join(root, `${next}/mac-universal/Attendance Handler.app`);
    const archive = join(root, 'update.zip'); await exec('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', newBundle, archive]);
    const { stdout } = await exec(resolve('build/sparkle/bin/sign_update'), ['--ed-key-file', seedFile, archive]);
    const signature = stdout.match(/sparkle:edSignature="([^"]+)"/)?.[1]; assert.ok(signature);
    appcast = `<?xml version="1.0"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>Isolated update test</title><item><title>Test ${next}</title><sparkle:version>${next}</sparkle:version><sparkle:shortVersionString>${next}</sparkle:shortVersionString><enclosure url="${feed}update.zip" sparkle:edSignature="${signature}" length="${(await stat(archive)).size}" type="application/octet-stream"/></item></channel></rss>`;
    downloads.set('/update.zip', archive); executable = join(oldBundle, 'Contents/MacOS/Attendance Handler');
  } else {
    const oldInstaller = join(root, '99.0.0', assetNames('99.0.0').windows);
    const installed = join(root, 'installed');
    await exec(oldInstaller, ['/S', `/D=${installed}`], { windowsHide: true, timeout: 120000 });
    executable = join(installed, 'Attendance Handler.exe');
    windowsYaml = await readFile(join(root, next, 'latest.yml'), 'utf8');
    const metadata = parse(windowsYaml); assert.equal(metadata.version, next);
    const newInstaller = join(root, next, assetNames(next).windows);
    assert.equal(createHash('sha512').update(await readFile(newInstaller)).digest('base64'), metadata.sha512);
    downloads.set('/' + assetNames(next).windows, newInstaller);
  }
  application = await electron.launch({ executablePath: executable }); oldPid = await application.evaluate(() => process.pid);
  application.process().stderr.on('data', bytes => { if (bytes.toString().includes('update-test:')) console.log(bytes.toString().trim()); });
  const window = await application.firstWindow();
  window.setDefaultTimeout(30000);
  await window.getByRole('heading', { name: '我的课程', exact: true }).waitFor();
  await window.evaluate(() => window.attendance.checkForUpdates());
  assert.equal((await window.evaluate(() => window.attendance.getState())).update.currentVersion, '99.0.0');
  assert.equal((await window.evaluate(() => window.attendance.getState())).update.phase, 'current');
  await window.evaluate(async () => {
    await window.attendance.saveSettings({ browserMode: 'background' });
    const state = await window.attendance.getState();
    await window.attendance.saveSchedule({ id: crypto.randomUUID(), courseId: state.courses[0].id, enabled: true, localTime: '12:00', timeZone: 'UTC', durationMinutes: 50, effectiveFrom: Date.now(), recurrence: { kind: 'once', date: '2099-01-01' } });
  });
  const expected = await window.evaluate(() => window.attendance.getState());
  const loginBytes = Buffer.from('synthetic opaque encrypted-session fixture');
  await writeFile(join(data, 'session.enc'), loginBytes);
  await mkdir(join(data, 'chrome-profile'), { recursive: true });
  await writeFile(join(data, 'chrome-profile/synthetic-marker'), 'synthetic browser profile');
  // A rejected package must leave the existing application alive and untouched.
  latestVersion = next; badUpdate = true; await window.evaluate(() => window.attendance.checkForUpdates());
  console.log('Checking rejection of an invalid update package…');
  let timer;
  try { await Promise.race([window.evaluate(() => window.attendance.downloadUpdate()), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Invalid package rejection timed out')), 90000); })]); }
  finally { clearTimeout(timer); }
  assert.equal((await window.evaluate(() => window.attendance.getState())).update.phase, 'error');
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), '99.0.0');
  badUpdate = false;
  console.log('Downloading a verified update and waiting for installation and relaunch…');
  await window.getByRole('button', { name: '下载更新', exact: true }).click();
  const deadline = Date.now() + 120000;
  let receipt;
  while (Date.now() < deadline) {
    try { receipt = JSON.parse(await readFile(join(data, 'update-test-started.json'), 'utf8')); if (receipt.version === next) break; } catch {}
    await delay(250);
  }
  assert.equal(receipt?.version, next, 'the downloaded version must replace and relaunch the installed application');
  relaunchedPid = receipt.pid; assert.notEqual(relaunchedPid, oldPid);
  assert.deepEqual(receipt.courses, expected.courses); assert.deepEqual(receipt.schedules, expected.schedules); assert.deepEqual(receipt.settings, expected.settings); assert.deepEqual(receipt.logs, expected.logs); assert.deepEqual(receipt.summaries, expected.summaries);
  assert.deepEqual(await readFile(join(data, 'session.enc')), loginBytes);
  assert.equal(await readFile(join(data, 'chrome-profile/synthetic-marker'), 'utf8'), 'synthetic browser profile');
  await mkdir('.test-artifacts', { recursive: true });
  await writeFile('.test-artifacts/update-native-report.json', JSON.stringify({ platform: process.platform, oldVersion: '99.0.0', newVersion: next, checks: ['reject invalid archive checksum/signature without quitting', 'download through application IPC', 'automatic installation and relaunch', 'universal macOS / installed Windows NSIS', 'courses, schedule, settings, logs, and summaries retained', 'opaque login and browser-profile fixtures retained byte-for-byte (no real authentication)'], passed: true }, null, 2));
  console.log('Native update passed: invalid package rejected; app upgraded and relaunched; local data retained.');
} finally {
  try { await application?.evaluate(({ app }) => app.quit()); } catch {}
  if (!relaunchedPid) { try { const receipt = JSON.parse(await readFile(join(data, 'update-test-started.json'), 'utf8')); if (receipt.pid !== oldPid) relaunchedPid = receipt.pid; } catch {} }
  if (relaunchedPid) { try { process.kill(relaunchedPid, 'SIGTERM'); } catch {} }
  await mock.close(); await new Promise(resolve => server.close(resolve));
  if (process.platform === 'win32') {
    try { await exec(join(root, 'installed/Uninstall Attendance Handler.exe'), ['/S'], { windowsHide: true, timeout: 30000 }); } catch {}
  }
  await rm(seedFile, { force: true });
  console.log('Isolated update fixtures retained for diagnostics:', root);
}
