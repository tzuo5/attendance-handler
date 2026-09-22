import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createMockClassroom } from './mock-classroom.mjs';

await mkdir('.test-artifacts', { recursive: true });
await build({ entryPoints: ['src/main/browser.ts'], outfile: '.test-artifacts/browser.mjs', format: 'esm', bundle: true, platform: 'node', external: ['playwright-core'] });
await build({ entryPoints: ['src/main/watchdog.ts'], outfile: '.test-artifacts/watchdog.mjs', format: 'esm', bundle: true, platform: 'node' });
const { ChromeClassroom } = await import(pathToFileURL(resolve('.test-artifacts/browser.mjs')));
const { Watchdog } = await import(pathToFileURL(resolve('.test-artifacts/watchdog.mjs')));
const mock = await createMockClassroom();
const profile = await mkdtemp(join(tmpdir(), 'attendance-integration-'));
const native = resolve('dist-electron/attendance-native');
const exec = promisify(execFile);
const frontmost = async () => JSON.parse((await exec(native, ['frontmost'])).stdout).pid;
const key = randomBytes(32);
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString(value) { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const payload = Buffer.concat([c.update(value, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), payload]); },
  decryptString(value) { const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); d.setAuthTag(value.subarray(12, 28)); return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString(); },
};
const notifications = [], logs = [], checks = [];
const browser = new ChromeClassroom(profile, mock.origin, cipher, () => {}, m => logs.push(m), native);
const watchdog = new Watchdog(browser, { changed: () => {}, log: (_level, message) => logs.push(message), notify: (...args) => notifications.push(args), clearNotifications: () => {}, keepAwake: () => {} });
const course = { id: '11111111-1111-4111-8111-111111111111', remoteId: 'demo', name: 'Integration', url: `${mock.origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 5, mode: 'auto-a' };
async function until(fn, message, timeout = 10000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(150); } throw new Error(message); }
try {
  const focused = await frontmost();
  await watchdog.start(course);
  assert.equal(await frontmost(), focused, 'background Chrome launch must preserve foreground application'); checks.push('background launch preserves focus');
  await until(async () => (await browser.read()).state === 'login', 'login page did not load');
  await watchdog.tick(); assert.equal(watchdog.session.status, 'needs-login');
  await browser.page.locator('#sign-in-button').click();
  await until(async () => (await browser.page.locator('.course-title').count()) > 0, 'login did not complete');
  await browser.capture();
  const saved = await readFile(join(profile, 'session.enc'));
  assert.ok(!saved.includes(Buffer.from('demo-access-token'))); checks.push('session is encrypted');
  await browser.prepare(course, watchdog.session.endsAt, new AbortController().signal);
  const geolocation = await browser.page.evaluate(() => new Promise(resolve => navigator.geolocation.getCurrentPosition(p => resolve([p.coords.latitude, p.coords.longitude]))));
  assert.deepEqual(geolocation, [0, 0]); checks.push('configured geolocation');
  mock.control({ open: true });
  await until(async () => (await browser.read()).state === 'joinable', 'join button not detected');
  await watchdog.tick();
  await until(() => mock.state.joined, 'automatic attendance did not join');
  await watchdog.tick();
  assert.equal(watchdog.session.attendance, 'confirmed'); checks.push('attendance confirmed from page');
  const afterLoginFocus = await frontmost();
  mock.control({ newQuestion: 'single' });
  await until(async () => !!(await browser.read()).question, 'question not detected');
  await watchdog.tick();
  await until(() => mock.state.submissions.length === 1, 'A was not submitted');
  assert.equal(mock.state.submissions[0].answer, 'A');
  await delay(800); await watchdog.tick(); await watchdog.tick();
  assert.equal(mock.state.submissions.length, 1); checks.push('single submission with confirmed receipt');
  assert.equal(await frontmost(), afterLoginFocus, 'automatic answer must not change focus'); checks.push('answer preserves focus');
  await browser.minimize();
  mock.control({ newQuestion: 'single' });
  await until(async () => (await browser.read()).question?.key.endsWith('q2'), 'second question not detected');
  await watchdog.tick();
  await until(() => mock.state.submissions.length === 2, 'minimized window failed to answer'); checks.push('minimized window continues monitoring');
  mock.control({ newQuestion: 'other' });
  await until(async () => (await browser.read()).question?.kind === 'other', 'other question not detected');
  await watchdog.tick();
  assert.equal(mock.state.submissions.length, 2); assert.ok(notifications.some(n => n[0].startsWith('question:'))); checks.push('non-MC falls back to notification');
  await browser.show();
  await browser.page.screenshot({ path: '.test-artifacts/classroom.png' });
  await browser.page.close(); await watchdog.tick();
  assert.equal(watchdog.session.status, 'window-closed'); checks.push('closed classroom pauses');
  await browser.show();
  await until(async () => (await browser.read()).state !== 'login', 'new tab did not restore encrypted session');
  await watchdog.resumed(); checks.push('explicit reopen restores session');
  await watchdog.stop();
  assert.equal(watchdog.session.status, 'stopped');
  const gate = await browser.page.evaluate(() => window.__attendanceDeadline);
  assert.equal(gate, 0); checks.push('stop disarms actions');
  await browser.context.setGeolocation({ latitude: 0, longitude: 0 }); // synthetic location only
  await browser.disarm();
  await watchdog.start({ ...course, mode: 'notify' });
  mock.control({ newQuestion: 'single' });
  await until(async () => (await browser.read()).question?.key.endsWith('q4'), 'notification poll not detected');
  const before = mock.state.submissions.length; await watchdog.tick();
  assert.equal(mock.state.submissions.length, before); checks.push('notify mode never auto-submits');
  await watchdog.stop();
  const courses = await browser.importCourses(); assert.ok(courses.some(c => c.remoteId === 'demo')); checks.push('course import');
  await browser.capture();
  const restartCDP = await browser.browser.newBrowserCDPSession();
  await restartCDP.send('Browser.close').catch(() => {});
  await until(() => !browser.browser.isConnected(), 'test Chrome did not close');
  await browser.login();
  await until(async () => (await browser.read()).state !== 'login', 'full browser restart did not restore encrypted session');
  assert.equal(await browser.page.evaluate(() => sessionStorage.getItem('access_token')), 'demo-access-token');
  checks.push('full Chrome restart restores encrypted session');
  await browser.page.evaluate(() => window.logout());
  await browser.capture();
  await browser.page.reload({ waitUntil: 'domcontentloaded' });
  await until(async () => (await browser.read()).state === 'login', 'explicit logout was overwritten by restoration');
  assert.equal(await browser.page.evaluate(() => sessionStorage.getItem('access_token')), null);
  assert.deepEqual(await browser.vault.load(), {});
  checks.push('explicit logout remains logged out after reload');
  await writeFile('.test-artifacts/integration-report.json', JSON.stringify({ passed: checks, logs, profile }, null, 2));
  console.log(JSON.stringify({ passed: checks }, null, 2));
} catch (error) {
  console.error('Integration logs:', logs);
  if (browser.isOpen()) {
    console.error('Page:', await browser.read().catch(() => 'unavailable'));
    await browser.page.screenshot({ path: '.test-artifacts/failure.png' }).catch(() => {});
  }
  throw error;
} finally {
  await watchdog.stop(); await browser.dispose();
  // Close only the explicitly created test browser/profile.
  if (browser.browser?.isConnected()) await browser.browser.close();
  await mock.close();
}
