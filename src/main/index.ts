import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, powerMonitor, powerSaveBlocker, safeStorage, Tray, dialog } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import { ChromeClassroom } from './browser';
import { Store } from './store';
import { Watchdog } from './watchdog';
import { validateCourse } from '../shared/validation';
import { ACTIVE, STATUS_LABELS, type AppState } from '../shared/types';

const demo = process.env.ATTENDANCE_DEMO === '1';
const origin = demo ? process.env.ATTENDANCE_ORIGIN || 'http://127.0.0.1:43891' : 'https://student.iclicker.com';
if (demo && !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('演示课堂仅允许本机地址');
if (process.env.ATTENDANCE_DATA_DIR && demo) app.setPath('userData', process.env.ATTENDANCE_DATA_DIR);
app.setName('Attendance Handler');
if (!app.requestSingleInstanceLock()) app.quit();
else void main();

async function main() {
  await app.whenReady();
  let window: BrowserWindow;
  let tray: Tray;
  let quitting = false;
  let blockId: number | undefined;
  let notificationError: string | undefined;
  const notifications = new Map<string, Notification>();
  let store: Store;
  try { store = new Store(app.getPath('userData')); }
  catch (error) { dialog.showErrorBox('无法读取课程数据', String(error)); app.exit(1); return; }
  if (ACTIVE(store.data.session)) {
    store.data.session.status = 'stopped';
    store.data.session.detail = '上次运行已中断，请重新开始上课';
    store.save();
  }
  if (demo && !store.data.courses.length) {
    store.data.courses = [
      { id: '11111111-1111-4111-8111-111111111111', remoteId: 'demo', name: '模拟课堂 · 自动 A', url: `${origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 50, mode: 'auto-a' },
      { id: '22222222-2222-4222-8222-222222222222', remoteId: 'demo', name: '模拟课堂 · 提醒作答', url: `${origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 50, mode: 'notify' },
    ]; store.save();
  }
  const snapshot = (): AppState => ({ courses: store.data.courses, session: watchdog?.session || store.data.session, logs: store.data.logs, browserConnected: browser?.isOpen() || false, demo, notificationError });
  const emit = () => {
    if (window && !window.isDestroyed()) window.webContents.send('state:changed', snapshot());
    if (tray) {
      const run = watchdog?.session;
      const remaining = ACTIVE(run) ? Math.max(0, Math.ceil((run.endsAt - Date.now()) / 60000)) : null;
      tray.setTitle(remaining !== null ? `${remaining}m` : '');
      tray.setToolTip(ACTIVE(run) ? `${run.course.name} · ${STATUS_LABELS[run.status]}` : 'Attendance Handler');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: ACTIVE(run) ? `${run.course.name} · ${remaining} 分钟` : '课堂助手', enabled: false },
        { label: '打开 App', click: () => { window.show(); window.focus(); } },
        { label: '查看课堂', click: () => { void showClassroom().catch(reportError); } },
        { label: '结束上课', enabled: ACTIVE(run), click: () => { void watchdog.stop().catch(reportError); } },
        { type: 'separator' }, { label: '退出', click: () => app.quit() },
      ]));
    }
  };
  const log = (level: 'info' | 'success' | 'warning' | 'error', message: string) => { store.log(level, message); emit(); };
  const reportError = (error: unknown) => log('error', error instanceof Error ? error.message : String(error));
  const nativeHelper = join(__dirname, 'attendance-native').replace('app.asar/', 'app.asar.unpacked/');
  const browser = new ChromeClassroom(app.getPath('userData'), origin, safeStorage, emit, message => log('warning', message), nativeHelper);
  const clearNotifications = () => { for (const notification of notifications.values()) notification.close(); notifications.clear(); };
  const sendNotification = (key: string, title: string, body: string) => {
    notifications.get(key)?.close();
    const notification = new Notification({ title, body, silent: false });
    notifications.set(key, notification);
    notification.on('click', () => {
      if (key === 'test') { window.show(); window.focus(); }
      else if (ACTIVE(watchdog.session)) void showClassroom().catch(reportError);
      else { window.show(); window.focus(); }
    });
    notification.on('failed', (_event, error) => {
      notificationError = `系统通知未能送达：${error}。请检查 macOS 通知设置。`;
      log('error', notificationError);
    });
    notification.on('show', () => { notificationError = undefined; emit(); });
    notification.show();
  };
  const watchdog = new Watchdog(browser, {
    changed: session => { store.data.session = session; store.save(); emit(); }, log,
    notify: sendNotification, clearNotifications,
    keepAwake: enabled => {
      if (enabled && blockId === undefined) blockId = powerSaveBlocker.start('prevent-app-suspension');
      if (!enabled && blockId !== undefined) { powerSaveBlocker.stop(blockId); blockId = undefined; }
    },
  });
  const showClassroom = async () => { await browser.show(); await watchdog.resumed(); };
  window = new BrowserWindow({
    width: 1160, height: 800, minWidth: 900, minHeight: 640, title: 'Attendance Handler',
    titleBarStyle: 'hiddenInset', backgroundColor: '#f6f5f1',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const invoke = (channel: string, handler: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('未授权的请求');
      return handler(...args);
    });
  };
  invoke('state:get', snapshot);
  invoke('course:save', input => {
    const course = validateCourse(input, origin);
    if (ACTIVE(watchdog.session) && watchdog.session.course.id === course.id) throw new Error('请先结束这门课，再修改配置。');
    const index = store.data.courses.findIndex(c => c.id === course.id);
    if (index === -1) store.data.courses.push(course); else store.data.courses[index] = course;
    store.save(); emit(); return snapshot();
  });
  invoke('course:delete', input => {
    const id = z.string().uuid().parse(input);
    if (ACTIVE(watchdog.session) && watchdog.session.course.id === id) throw new Error('请先结束这门课，再删除配置。');
    store.data.courses = store.data.courses.filter(c => c.id !== id); store.save(); emit(); return snapshot();
  });
  invoke('course:import', () => browser.importCourses());
  invoke('browser:login', () => browser.login());
  invoke('browser:show', showClassroom);
  invoke('browser:minimize', () => browser.minimize());
  invoke('session:start', async input => {
    const id = z.string().uuid().parse(input);
    const course = store.data.courses.find(c => c.id === id);
    if (!course) throw new Error('未找到课程');
    validateCourse(course, origin);
    await watchdog.start(course);
  });
  invoke('session:stop', () => watchdog.stop());
  invoke('notification:test', () => sendNotification('test', '课堂提醒已准备好', '有新题目时，你会在这里收到提醒。点击可返回 App。'));
  const icon = nativeImage.createFromPath(join(__dirname, 'tray.png')).resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  tray = new Tray(icon); emit();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Attendance Handler', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]));
  if (process.env.ATTENDANCE_DEV === '1' && !app.isPackaged) await window.loadURL('http://127.0.0.1:5173');
  else await window.loadFile(join(__dirname, '../dist/index.html'));
  app.on('second-instance', () => { window.show(); window.focus(); });
  app.on('activate', () => { window.show(); });
  powerMonitor.on('resume', () => { void watchdog.resumed().catch(reportError); });
  powerMonitor.on('suspend', () => { if (ACTIVE(watchdog.session)) log('warning', '系统已进入睡眠；唤醒后按原截止时间恢复监控'); });
  const menuTimer = setInterval(emit, 15000);
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true; clearInterval(menuTimer);
    void (async () => {
      await watchdog.stop().catch(reportError);
      await browser.dispose().catch(reportError);
      clearNotifications(); tray.destroy(); app.exit(0);
    })();
  });
}
