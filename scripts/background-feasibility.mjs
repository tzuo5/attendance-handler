// P3.1 prototype: explicitly restart one dedicated profile, without a product mode setting.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createMockClassroom } from './mock-classroom.mjs';

await mkdir('.test-artifacts/phase3', { recursive: true });
for (const name of ['browser', 'watchdog', 'platform']) {
  await build({ entryPoints: [`src/main/${name}.ts`], outfile: `.test-artifacts/phase3/${name}.mjs`, format: 'esm', bundle: true, platform: 'node', external: ['playwright-core'] });
}
const moduleOf = name => import(pathToFileURL(resolve(`.test-artifacts/phase3/${name}.mjs`)));
const { ChromeClassroom } = await moduleOf('browser');
const { Watchdog } = await moduleOf('watchdog');
const { launchChrome } = await moduleOf('platform');
const mock = await createMockClassroom();
const directory = await mkdtemp(join(tmpdir(), 'attendance-background-'));
const helper = resolve(`dist-electron/attendance-native${process.platform === 'win32' ? '.exe' : ''}`);
const exec = promisify(execFile);
const native = async (...args) => JSON.parse((await exec(helper, args, { windowsHide: true, timeout: 5000 })).stdout);
const key = randomBytes(32);
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
    const payload = Buffer.concat([c.update(value, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), payload]);
  },
  decryptString(value) {
    const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    d.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString();
  },
};
const logs = [], checks = [], processes = [], notifications = [];
let preferredMode = 'visible';
const browser = new ChromeClassroom(directory, mock.origin, cipher, () => {}, message => logs.push(message), helper, () => preferredMode);
const watchdog = new Watchdog(browser, { changed: () => {}, log: (_level, message) => logs.push(message), notify: (...args) => notifications.push(args), clearNotifications: () => {}, keepAwake: () => {} });
const course = { id: '11111111-1111-4111-8111-111111111111', remoteId: 'demo', name: 'Background prototype', url: `${mock.origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 5, mode: 'auto-a' };
async function until(condition, message) {
  const end = Date.now() + 12000;
  while (Date.now() < end) { if (await condition()) return; await delay(100); }
  throw new Error(message);
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const pidOf = async () => {
  const cdp = await browser.browser.newBrowserCDPSession();
  try { return (await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p => p.type === 'browser').id; }
  finally { await cdp.detach(); }
};
let runId, endsAt, version;
async function switchTo(mode) {
  preferredMode = mode;
  const previousPid = await pidOf();
  await browser.capture();
  await browser.dispose();
  await until(() => !alive(previousPid), 'previous browser process still owns the dedicated profile');
  const focused = (await native('frontmost')).pid;
  await launchChrome(browser.profile, mode);
  await until(async () => {
    try {
      const [port, path] = (await readFile(join(browser.profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
      return (await response.json()).webSocketDebuggerUrl?.endsWith(path);
    } catch { return false; }
  }, 'new browser did not become ready');
  await browser.prepare(course, endsAt, new AbortController().signal);
  const pid = await pidOf();
  processes.push(pid);
  assert.notEqual(pid, previousPid);
  assert.equal(alive(previousPid), false, 'mode switches must never overlap browser processes');
  const ua = await browser.page.evaluate(() => navigator.userAgent);
  assert.equal(ua.includes('HeadlessChrome'), mode === 'background', 'the new process must use the requested real Chrome mode');
  if (mode === 'background') {
    assert.equal((await native('visible-windows', String(pid))).count, 0, 'headless Chrome displayed a native window');
    assert.equal((await native('frontmost')).pid, focused, 'background restart changed focus');
  }
  assert.equal(await browser.page.evaluate(() => sessionStorage.getItem('access_token')), 'demo-access-token');
  assert.ok((await browser.context.cookies(mock.origin)).some(c => c.name === 'prototype-login' && c.value === 'synthetic-cookie'), 'profile cookie was lost');
  await watchdog.resumed();
  assert.equal(watchdog.session.id, runId);
  assert.equal(watchdog.session.endsAt, endsAt);
  assert.equal(await browser.page.evaluate(() => window.__attendanceDeadline), endsAt);
}
try {
  await watchdog.start(course);
  runId = watchdog.session.id; endsAt = watchdog.session.endsAt;
  version = browser.browser.version();
  processes.push(await pidOf());
  await browser.page.locator('#sign-in-button').click();
  await browser.page.locator('.course-title').waitFor();
  await browser.context.addCookies([{ name: 'prototype-login', value: 'synthetic-cookie', url: mock.origin, httpOnly: true, expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await browser.capture();
  assert.ok(!(await readFile(join(directory, 'session.enc'))).includes(Buffer.from('demo-access-token')));
  checks.push('visible sign-in stores an encrypted session and dedicated persistent cookie');
  await switchTo('background');
  checks.push('headless restart retains login, profile cookie, original session and deadline, without visible windows or focus changes');
  mock.control({ open: true });
  await until(async () => (await browser.read()).state === 'joinable', 'headless join control was not detected');
  await watchdog.tick();
  await until(() => mock.state.joined, 'headless attendance was not submitted');
  await watchdog.tick();
  assert.equal(watchdog.session.attendance, 'confirmed');
  mock.control({ newQuestion: 'single' });
  await until(async () => !!(await browser.read()).question, 'headless question was not detected');
  await watchdog.tick();
  await until(() => mock.state.submissions.length === 1, 'headless answer was not submitted');
  await watchdog.tick();
  assert.equal(mock.state.submissions[0].answer, 'A');
  assert.equal(watchdog.session.handled['demo-session:q1'], 'confirmed');
  checks.push('headless attendance and one automatic answer have page-confirmed receipts');
  await switchTo('visible');
  await watchdog.tick();
  assert.equal(mock.state.submissions.length, 1, 'existing answer was submitted again after restart');
  checks.push('headless to visible restart preserves confirmed answer and deduplication');
  mock.control({ newQuestion: 'other' });
  await until(async () => (await browser.read()).question?.kind === 'other', 'manual question was not detected');
  await watchdog.tick();
  assert.equal(watchdog.session.status, 'needs-answer');
  assert.ok(notifications.some(n => n[0].startsWith('question:')));
  await browser.show();
  await browser.page.locator('#short-answer').fill('synthetic manual response');
  await browser.page.getByRole('button', { name: 'Send', exact: true }).click();
  await until(() => mock.state.submissions.length === 2, 'manual answer was not received');
  await switchTo('background');
  await watchdog.tick();
  assert.equal(mock.state.submissions.length, 2, 'returning to background overwrote the manual response');
  assert.equal(mock.state.submissions[1].answer, 'synthetic manual response');
  checks.push('manual handling returns to headless monitoring with prior responses and deadline intact');
  await watchdog.stop();
  const lastPid = await pidOf();
  await browser.dispose();
  await until(() => !alive(lastPid), 'stopping the prototype left its browser running');
  assert.ok(processes.every(pid => !alive(pid)));
  checks.push('all four dedicated browser processes exit without a profile lock or leftover process');
  await writeFile('.test-artifacts/phase3/feasibility-report.json', JSON.stringify({ platform: process.platform, chrome: version, passed: checks, logs }, null, 2));
  console.log(JSON.stringify({ platform: process.platform, chrome: version, passed: checks }, null, 2));
} finally {
  await watchdog.stop();
  await browser.dispose();
  await mock.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
