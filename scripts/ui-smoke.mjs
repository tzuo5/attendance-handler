import { _electron as electron, chromium } from 'playwright-core';
import { createMockClassroom } from './mock-classroom.mjs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const mock = await createMockClassroom();
await mkdir('.test-artifacts', { recursive: true });
const data = await mkdtemp(join(tmpdir(), 'attendance-ui-'));
const defaultApp = process.platform === 'win32' ? 'release-public/win-unpacked/Attendance Handler.exe' : 'release/mac-arm64/Attendance Handler.app/Contents/MacOS/Attendance Handler';
const application = await electron.launch({ executablePath: resolve(process.env.ATTENDANCE_TEST_APP || defaultApp), env: { ...process.env, ATTENDANCE_DEMO: '1', ATTENDANCE_ORIGIN: mock.origin, ATTENDANCE_DATA_DIR: data } });
const electronPid = await application.evaluate(() => process.pid);
const errors = [];
let classroom;
try {
  const window = await application.firstWindow();
  window.on('pageerror', e => errors.push(e.message));
  await window.getByRole('heading', { name: '我的课程', exact: true }).waitFor();
  assert.equal(await window.locator('.course-card').count(), 2);
  assert.equal(await window.getByText('位置已设置', { exact: true }).count(), 2);
  assert.ok(!/\d+\.\d+\s*,\s*-?\d+\.\d+/.test(await window.locator('.course-meta').first().innerText()));
  await window.screenshot({ path: '.test-artifacts/app-courses.png' });
  await window.getByRole('button', { name: '添加课程', exact: true }).click();
  await window.getByLabel('课程名称', { exact: true }).fill('UI 测试课程');
  await window.getByLabel('iClicker 课程链接', { exact: true }).fill(`${mock.origin}/#/course/test/overview`);
  await window.getByLabel('纬度 Latitude').fill('0');
  await window.getByLabel('经度 Longitude').fill('0');
  await window.getByLabel('答题方式').selectOption('notify');
  await window.screenshot({ path: '.test-artifacts/app-course-form.png' });
  await window.getByRole('button', { name: '保存课程', exact: true }).click();
  await window.getByRole('heading', { name: 'UI 测试课程', exact: true }).waitFor();
  const saved = await window.evaluate(() => window.attendance.getState());
  assert.equal(saved.courses.length, 3);
  assert.equal(JSON.parse(await readFile(join(data, 'state.json'), 'utf8')).courses.length, 3);
  // Exercise the installed app's unpacked native helper, Chrome discovery, and OS encryption.
  await window.evaluate(() => window.attendance.login());
  const [port] = (await readFile(join(data, 'chrome-profile', 'DevToolsActivePort'), 'utf8')).split('\n');
  classroom = await chromium.connectOverCDP(`http://127.0.0.1:${port.trim()}`);
  const page = classroom.contexts()[0].pages().find(page => page.url().startsWith(mock.origin));
  assert.ok(page, 'packaged app opens its dedicated Chrome classroom');
  await page.locator('#sign-in-button').click();
  await page.locator('.course-title').first().waitFor();
  await window.evaluate(id => window.attendance.start(id), saved.courses[0].id);
  mock.control({ open: true });
  await window.waitForFunction(async () => (await window.attendance.getState()).session?.attendance === 'confirmed', undefined, { timeout: 20000 });
  const encrypted = await readFile(join(data, 'session.enc'));
  assert.ok(!encrypted.includes(Buffer.from('demo-access-token')));
  const vault = await application.evaluate(({ safeStorage }, base64) => JSON.parse(safeStorage.decryptString(Buffer.from(base64, 'base64'))), encrypted.toString('base64'));
  assert.equal(vault.storage.access_token, 'demo-access-token');
  await window.evaluate(() => window.attendance.stop());
  await window.getByRole('button', { name: '连接与提醒', exact: true }).click();
  await window.screenshot({ path: '.test-artifacts/app-settings.png' });
  const notification = await application.evaluate(async ({ Notification }) => {
    const n = new Notification({ title: 'Attendance Handler · 测试', body: '这是应用打包后的系统通知测试。', silent: false });
    globalThis.__attendanceTestNotification = n;
    return Promise.race([
      new Promise(resolve => { n.on('show', () => resolve({ event: 'show' })); n.on('failed', (_event, message) => resolve({ event: 'failed', message })); n.show(); }),
      new Promise(resolve => setTimeout(() => resolve({ event: 'timeout' }), 10000)),
    ]);
  });
  const notifications = process.platform === 'darwin' ? await application.evaluate(async ({ Notification }) => (await Notification.getHistory()).map(n => ({ title: n.title, body: n.body }))) : [];
  assert.deepEqual(errors, []);
  const checks = ['course list', 'course persistence', 'settings', 'packaged Chrome launch and native helper', 'mock attendance', 'OS-encrypted session round trip'];
  await writeFile('.test-artifacts/ui-report.json', JSON.stringify({ checks, errors, notification, delivered: notifications, data }, null, 2));
  console.log(JSON.stringify({ checks, errors, notification, deliveredCount: notifications.length }, null, 2));
} finally {
  // Let the app disarm its live CDP session before terminating the test Chrome.
  console.log('Closing packaged application');
  const isRunning = () => { try { process.kill(electronPid, 0); return true; } catch { return false; } };
  try {
    // Queue quit after the inspector reply. On Windows Playwright launches via
    // cmd.exe, so check the actual Electron PID instead of waiting for that shell.
    await application.evaluate(({ app }) => { setTimeout(() => app.quit(), 0); });
    const deadline = Date.now() + 20000;
    while (isRunning() && Date.now() < deadline) await delay(100);
    assert.ok(!isRunning(), 'packaged Electron process exits gracefully within 20 seconds');
    console.log('Packaged Electron process exited');
  }
  finally {
    if (isRunning()) process.kill(electronPid, 'SIGKILL');
    const launcher = application.process();
    if (process.platform === 'win32' && launcher.exitCode === null && launcher.pid) {
      await promisify(execFile)('taskkill', ['/pid', String(launcher.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }).catch(() => {});
    }
    console.log('Closing dedicated test Chrome');
    if (classroom?.isConnected()) {
      const cdp = await classroom.newBrowserCDPSession();
      await cdp.send('Browser.close').catch(() => {});
      await classroom.close();
    }
    await mock.close();
    console.log('UI smoke cleanup complete');
  }
}
