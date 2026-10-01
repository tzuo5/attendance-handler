import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, powerMonitor, powerSaveBlocker, safeStorage, Tray, dialog, shell } from 'electron';
import { release } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ChromeClassroom } from './browser';
import { nativeHelperName, findChrome } from './platform';
import { checkEnvironment, checkDataWritable } from './environment';
import { summarizeSession } from '../shared/session-summary';
import { Store } from './store';
import { Watchdog } from './watchdog';
import { validateCourse } from '../shared/validation';
import { ACTIVE, environmentReady, sessionPresentation, type AppState, type LogDetails, type EnvironmentReport, type LoginReport, type CourseImportReport } from '../shared/types';
import { advanceSetup, initialSetup } from '../shared/setup';
import { beginNotificationTest, notificationEvent, notificationResolved, recordNotificationChoice, unverifiedNotification } from '../shared/notification-check';

const demo = process.env.ATTENDANCE_DEMO === '1';
const origin = demo ? process.env.ATTENDANCE_ORIGIN || 'http://127.0.0.1:43891' : 'https://student.iclicker.com';
if (demo && !['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('演示课堂仅允许本机地址');
if (process.env.ATTENDANCE_DATA_DIR && demo) app.setPath('userData', process.env.ATTENDANCE_DATA_DIR);
app.setName('Attendance Handler');
if (process.platform === 'win32') app.setAppUserModelId('com.attendancehandler.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
else void main();

async function main() {
  await app.whenReady();
  let window: BrowserWindow;
  let tray: Tray;
  let quitting = false;
  let blockId: number | undefined;
  let notificationError: string | undefined;
  let environment:EnvironmentReport|undefined;
  let loginReport:LoginReport|undefined;
  let courseImport:CourseImportReport|undefined;
  let checkingLogin:Promise<LoginReport>|undefined;
  let importingCourses:Promise<CourseImportReport>|undefined;
  let updatingSetup = false;
  let activeTestAttempt: string | undefined;
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;
  let checkingEnvironment:Promise<EnvironmentReport>|undefined;
  const notifications = new Map<string, Notification>();
  let store: Store;
  try { store = new Store(app.getPath('userData')); }
  catch (error) { dialog.showErrorBox('无法读取课程数据', String(error)); app.exit(1); return; }
  if (ACTIVE(store.data.session)) {
    store.data.session.summary = summarizeSession(store.data.session, store.data.session.lastCheckedAt || store.data.session.startedAt, 'interrupted');
    store.data.session.status = 'stopped';
    store.data.session.detail = '上次运行已中断，请重新开始上课';
    store.setSession(store.data.session);
  }
  if (demo && process.env.ATTENDANCE_DEMO_EMPTY !== '1' && !store.data.courses.length) {
    store.data.courses = [
      { id: '11111111-1111-4111-8111-111111111111', remoteId: 'demo', name: '模拟课堂 · 自动 A', url: `${origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 50, mode: 'auto-a' },
      { id: '22222222-2222-4222-8222-222222222222', remoteId: 'demo', name: '模拟课堂 · 提醒作答', url: `${origin}/#/course/demo/overview`, latitude: 0, longitude: 0, accuracy: 10, durationMinutes: 50, mode: 'notify' },
    ]; store.data.setup = initialSetup(true); store.save();
  }
  const snapshot = (): AppState => ({ courses: store.data.courses, session: watchdog?.session || store.data.session, logs: store.data.logs, summaries: store.data.summaries, classroomOrigin: origin, browserConnected: browser?.isOpen() || false, browserMode: browser?.mode || 'visible', browserTransitioning: browser?.isTransitioning() || false, settings: store.data.settings, demo, notificationError, notificationCanConfirm: !!activeTestAttempt && activeTestAttempt === store.data.setup.notification?.attemptId && ['requested','pending'].includes(store.data.setup.notification.status), environment, loginReport, courseImport, setup: store.data.setup });
  const emit = () => {
    if (window && !window.isDestroyed()) window.webContents.send('state:changed', snapshot());
    if (tray) {
      const run = watchdog?.session;
      const remaining = ACTIVE(run) ? Math.max(0, Math.ceil((run.endsAt - Date.now()) / 60000)) : null;
      if (process.platform === 'darwin') tray.setTitle(remaining !== null ? `${remaining}m` : '');
      const modeLabel = browser?.mode === 'background' ? '后台模式' : '课堂窗口模式';
      tray.setToolTip(ACTIVE(run) ? `${run.course.name} · ${sessionPresentation(run).label} · ${modeLabel}` : 'Attendance Handler');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: ACTIVE(run) ? `${run.course.name} · ${sessionPresentation(run).label} · ${remaining} 分钟` : '课堂助手', enabled: false },
        { label: modeLabel, enabled: false },
        { label: '打开 App', click: () => { window.show(); window.focus(); } },
        { label: sessionPresentation(run).action, click: () => { void showClassroom().catch(reportError); } },
        { label: '返回后台', visible: ACTIVE(run) && browser?.mode === 'visible', enabled: !browser?.isTransitioning(), click: () => { void returnToBackground().catch(error => { reportError(error); sendNotification('background-return', '暂时无法返回后台', error instanceof Error ? error.message : '请打开 App 查看课堂状态后重试。'); }); } },
        { label: '结束上课', enabled: ACTIVE(run), click: () => { void watchdog.stop().catch(reportError); } },
        { type: 'separator' }, { label: '退出', click: () => app.quit() },
      ]));
    }
  };
  const log = (level: 'info' | 'success' | 'warning' | 'error', message: string, details?: LogDetails) => { store.log(level, message, details); emit(); };
  const reportError = (error: unknown) => log('error', error instanceof Error ? error.message : String(error));
  const nativeHelper = join(__dirname.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1'), nativeHelperName);
  const browser = new ChromeClassroom(app.getPath('userData'), origin, safeStorage, emit, message => log('warning', message), nativeHelper, () => store.data.settings.browserMode);
  const clearNotifications = () => { for (const notification of notifications.values()) notification.close(); notifications.clear(); };
  const updateTestEvent = (attempt: string, event: 'show' | 'failed' | 'timeout') => {
    const current = store.data.setup.notification || unverifiedNotification();
    const next = notificationEvent(current, attempt, event);
    if (next !== current) { store.data.setup.notification = next; store.save(); emit(); }
  };
  const sendNotification = (key: string, title: string, body: string, testAttempt?: string) => {
    notifications.get(key)?.close();
    const notification = new Notification({ title, body, silent: false });
    notifications.set(key, notification);
    notification.on('click', () => {
      if (key === 'test') { window.show(); window.focus(); }
      else if (ACTIVE(watchdog.session)) void showClassroom().catch(reportError);
      else { window.show(); window.focus(); }
    });
    notification.on('failed', (_event, error) => {
      if (notifications.get(key) !== notification) return;
      if (testAttempt && testAttempt !== activeTestAttempt) return;
      if (testAttempt) { clearTimeout(notificationTimer); updateTestEvent(testAttempt,'failed'); }
      notificationError = `系统通知未能送达：${error}。请检查系统通知设置。`;
      log('error', notificationError);
    });
    notification.on('show', () => { if (notifications.get(key) !== notification) return; if (testAttempt) { clearTimeout(notificationTimer); updateTestEvent(testAttempt,'show'); } notificationError = undefined; emit(); });
    notification.show();
  };
  const watchdog = new Watchdog(browser, {
    changed: session => { store.setSession(session); emit(); }, log,
    notify: sendNotification, clearNotifications,
    keepAwake: enabled => {
      if (enabled && blockId === undefined) blockId = powerSaveBlocker.start('prevent-app-suspension');
      if (!enabled && blockId !== undefined) { powerSaveBlocker.stop(blockId); blockId = undefined; }
    },
  });
  const showClassroom = () => watchdog.transition(signal => browser.show(signal));
  const returnToBackground = async () => {
    if (!ACTIVE(watchdog.session)) throw new Error('请先开始本节监控。');
    const run = watchdog.session;
    await watchdog.transition(signal => browser.returnToBackground(signal));
    if (ACTIVE(watchdog.session) && watchdog.session === run && browser.mode === 'background') log('success', '本节已返回后台，继续原结束时间和作答记录', { sessionId: run.id, courseId: run.course.id, courseName: run.course.name, endsAt: run.endsAt });
  };
  window = new BrowserWindow({
    width: 1160, height: 800, minWidth: 900, minHeight: 640, title: 'Attendance Handler',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', backgroundColor: '#f6f5f1',
    icon: join(__dirname, 'icon.png'), autoHideMenuBar: process.platform === 'win32',
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
  invoke('settings:save', input => {
    store.data.settings = z.object({ browserMode: z.enum(['visible','background']) }).strict().parse(input);
    store.save(); emit();
    return snapshot();
  });
  const checkLogin = () => {
    if (checkingLogin) return checkingLogin;
    checkingLogin = browser.checkLogin().then(report => { loginReport = report; emit(); return report; }).finally(() => { checkingLogin = undefined; });
    return checkingLogin;
  };
  const importCourses = () => {
    if (importingCourses) return importingCourses;
    importingCourses = browser.checkCourseImport().then(report => { courseImport = report; emit(); return report; }).finally(() => { importingCourses = undefined; });
    return importingCourses;
  };
  invoke('setup:login-check', checkLogin);
  invoke('setup:course-import', importCourses);
  invoke('setup:action', async input => {
    const action = z.enum(['next','back','dismiss','reopen','finish']).parse(input);
    if (updatingSetup) throw new Error('配置正在保存，请稍候重试。');
    updatingSetup = true;
    try {
    if (action === 'finish') await runEnvironmentCheck();
    if ((action === 'next' && store.data.setup.step === 'login') || action === 'finish') await checkLogin();
    const setup = advanceSetup(store.data.setup, action, { environment: environmentReady(environment), login: loginReport?.status === 'verified', courses: store.data.courses.length, notification: notificationResolved(store.data.setup.notification) });
    store.data.setup = setup; store.save(); emit(); return snapshot();
    } finally { updatingSetup = false; }
  });
  const runEnvironmentCheck = () => {
    if(checkingEnvironment)return checkingEnvironment;
    checkingEnvironment=checkEnvironment({
      supported:()=>process.platform==='darwin'?Number(release().split('.')[0])>=22:process.platform==='win32'&&Number(release().split('.')[0])>=10&&process.arch==='x64',
      chrome:findChrome,writable:()=>checkDataWritable(store.directory),encryption:()=>safeStorage.isEncryptionAvailable(),connect:()=>browser.checkConnection(),
    }).then(report=>{environment=report;emit();return report;}).finally(()=>{checkingEnvironment=undefined;});
    return checkingEnvironment;
  };
  invoke('environment:check',runEnvironmentCheck);
  invoke('help:open',async input=>{
    const target=z.enum(['chrome','data','notifications']).parse(input);
    if(target==='chrome')await shell.openExternal('https://www.google.com/chrome/');
    else if(target==='data'){const error=await shell.openPath(store.directory);if(error)throw new Error('数据文件夹无法打开，请检查当前系统账户的权限。');}
    else if(process.platform==='win32')await shell.openExternal('ms-settings:notifications');
    else{const error=await shell.openPath('/System/Applications/System Settings.app');if(error)throw new Error('请从 Apple 菜单打开系统设置，选择“通知”。');}
  });
  invoke('course:save', input => {
    const course = validateCourse(input, origin);
    if (ACTIVE(watchdog.session) && watchdog.session.course.id === course.id) throw new Error('请先结束这门课，再修改配置。');
    const previous = store.data.courses.find(c => c.id === course.id);
    if ((!previous || previous.remoteId !== course.remoteId) && store.data.courses.some(c => c.id !== course.id && c.remoteId === course.remoteId)) throw new Error('这门课程已经添加，请在课程列表中编辑原有课程。');
    const index = store.data.courses.findIndex(c => c.id === course.id);
    if (index === -1) store.data.courses.push(course); else store.data.courses[index] = course;
    store.save(); emit(); return snapshot();
  });
  invoke('course:delete', input => {
    const id = z.string().uuid().parse(input);
    if (ACTIVE(watchdog.session) && watchdog.session.course.id === id) throw new Error('请先结束这门课，再删除配置。');
    store.data.courses = store.data.courses.filter(c => c.id !== id); store.save(); emit(); return snapshot();
  });
  invoke('course:import', async () => { const report = await importCourses(); if (report.status !== 'courses') throw new Error(report.detail); return report.courses; });
  invoke('browser:login', () => watchdog.transition(signal => browser.login(signal)));
  invoke('browser:show', showClassroom);
  invoke('browser:minimize', () => browser.minimize());
  invoke('browser:background', returnToBackground);
  invoke('session:start', async input => {
    const id = z.string().uuid().parse(input);
    const course = store.data.courses.find(c => c.id === id);
    if (!course) throw new Error('未找到课程');
    validateCourse(course, origin);
    await watchdog.start(course);
  });
  invoke('session:stop', () => watchdog.stop());
  invoke('session:extend', () => watchdog.extend());
  invoke('notification:test', () => {
    clearTimeout(notificationTimer);
    const check = beginNotificationTest(); activeTestAttempt = check.attemptId;
    store.data.setup.notification = check; notificationError = undefined; store.save(); emit();
    notificationTimer = setTimeout(() => updateTestEvent(check.attemptId!,'timeout'),10000);
    try { sendNotification('test', 'Attendance Handler · 测试提醒', '这是一条测试提醒。看到后请回到 App 点击“我收到了”。', check.attemptId); }
    catch { clearTimeout(notificationTimer); updateTestEvent(check.attemptId!,'failed'); }
  });
  invoke('notification:choice', input => {
    const choice = z.enum(['received','not-received','later']).parse(input);
    store.data.setup.notification = recordNotificationChoice(store.data.setup.notification || unverifiedNotification(),choice,activeTestAttempt);
    clearTimeout(notificationTimer); store.save(); emit(); return snapshot();
  });
  const icon = nativeImage.createFromPath(join(__dirname, 'tray.png')).resize({ width: 18, height: 18 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon); emit();
  tray.on('double-click', () => { window.show(); window.focus(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Attendance Handler', submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const }, { type: 'separator' as const }, { role: 'quit' as const }] }] : [{ label: '文件', submenu: [{ role: 'quit' as const }] }]),
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
    event.preventDefault(); quitting = true; clearInterval(menuTimer); clearTimeout(notificationTimer);
    void (async () => {
      await watchdog.stop().catch(reportError);
      await browser.dispose().catch(reportError);
      clearNotifications(); tray.destroy(); app.exit(0);
    })();
  });
}
