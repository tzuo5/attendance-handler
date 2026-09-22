import { _electron as electron } from 'playwright-core';
import { createMockClassroom } from './mock-classroom.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const mock = await createMockClassroom();
const data = await mkdtemp(join(tmpdir(), 'attendance-ui-'));
const application = await electron.launch({ executablePath: resolve(process.env.ATTENDANCE_TEST_APP || 'release/mac-arm64/Attendance Handler.app/Contents/MacOS/Attendance Handler'), env: { ...process.env, ATTENDANCE_DEMO: '1', ATTENDANCE_ORIGIN: mock.origin, ATTENDANCE_DATA_DIR: data } });
const errors = [];
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
  const notifications = await application.evaluate(async ({ Notification }) => (await Notification.getHistory()).map(n => ({ title: n.title, body: n.body })));
  assert.deepEqual(errors, []);
  await writeFile('.test-artifacts/ui-report.json', JSON.stringify({ errors, notification, delivered: notifications, data }, null, 2));
  console.log(JSON.stringify({ errors, notification, deliveredCount: notifications.length }, null, 2));
} finally {
  await application.close(); await mock.close();
}
