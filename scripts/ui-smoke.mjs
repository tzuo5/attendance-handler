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
const launcher = application.process();
const errors = [];
const syntheticCipher = process.env.ATTENDANCE_UI_CIPHER === 'synthetic';
let classroom;
try {
  const window = await application.firstWindow();
  if (syntheticCipher) await application.evaluate(({ safeStorage }) => {
    // Test-only substitution in this isolated demo process; production code and
    // the default smoke check continue to use the operating system's storage.
    const { randomBytes, createCipheriv, createDecipheriv } = process.getBuiltinModule('node:crypto');
    const key = randomBytes(32);
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.encryptString = value => {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
      const payload = Buffer.concat([cipher.update(value, 'utf8'),cipher.final()]);
      return Buffer.concat([iv,payload,cipher.getAuthTag()]);
    };
    safeStorage.decryptString = value => {
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0,12));
      cipher.setAuthTag(value.subarray(-16));
      return Buffer.concat([cipher.update(value.subarray(12,-16)),cipher.final()]).toString();
    };
  });
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
  await window.getByRole('radio', { name:'提醒我手动作答', exact:true }).check();
  await window.screenshot({ path: '.test-artifacts/app-course-form.png' });
  await window.getByRole('button', { name: '保存课程', exact: true }).click();
  await window.getByRole('heading', { name: 'UI 测试课程', exact: true }).waitFor();
  const saved = await window.evaluate(() => window.attendance.getState());
  assert.equal(saved.courses.length, 3);
  await assert.rejects(window.evaluate(course => window.attendance.saveCourse({...course,id:crypto.randomUUID()}),saved.courses[2]),/已经添加/);
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
  await window.getByText('已确认签到',{exact:true}).waitFor({timeout:20000});
  assert.equal((await window.evaluate(() => window.attendance.getState())).session.attendance,'confirmed');
  const encrypted = await readFile(join(data, 'session.enc'));
  assert.ok(!encrypted.includes(Buffer.from('demo-access-token')));
  const vault = await application.evaluate(({ safeStorage }, base64) => JSON.parse(safeStorage.decryptString(Buffer.from(base64, 'base64'))), encrypted.toString('base64'));
  assert.equal(vault.storage.access_token, 'demo-access-token');
  const originalEnd = (await window.evaluate(() => window.attendance.getState())).session.endsAt;
  await window.evaluate(() => window.attendance.extend());
  assert.equal((await window.evaluate(() => window.attendance.getState())).session.endsAt,originalEnd+600000);
  await window.evaluate(() => window.attendance.stop());
  const completed = await window.evaluate(() => window.attendance.getState());
  assert.equal(completed.summaries.length,1);
  assert.equal(completed.summaries[0].attendance,'confirmed');
  assert.ok(completed.logs.some(entry=>entry.event==='session-extended'));
  await window.getByRole('button', { name: '连接与提醒', exact: true }).click();
  await window.screenshot({ path: '.test-artifacts/app-settings.png' });
  await application.evaluate(({Tray,Notification})=>{
    const menu=Tray.prototype.setContextMenu, tooltip=Tray.prototype.setToolTip;
    Tray.prototype.setContextMenu=function(value){globalThis.__attendanceTrayLabels=value.items.filter(item=>item.visible).map(item=>item.label);globalThis.__attendanceReturnBackground=value.items.find(item=>item.visible&&item.label==='返回后台');return menu.call(this,value);};
    Tray.prototype.setToolTip=function(value){globalThis.__attendanceTrayTooltip=value;return tooltip.call(this,value);};
    const show=Notification.prototype.show;
    Notification.prototype.show=function(){if(this.title.includes('需要作答'))globalThis.__attendanceManualReminder=this;if(this.title==='暂时无法返回后台')globalThis.__attendanceBlockedReturnReminder=this;return show.call(this);};
  });
  await window.getByRole('button',{name:'后台模式（无 Chrome 窗口）',exact:true}).click();
  await window.getByText('已保存，下次上课使用后台模式',{exact:true}).waitFor();
  assert.equal(JSON.parse(await readFile(join(data,'state.json'),'utf8')).settings.browserMode,'background');
  await window.getByRole('button',{name:'我的课程',exact:false}).click();
  await window.evaluate(id=>window.attendance.start(id),saved.courses[0].id);
  await window.getByText('后台模式 · 无 Chrome 窗口',{exact:true}).waitFor();
  const [backgroundPort]=(await readFile(join(data,'chrome-profile','DevToolsActivePort'),'utf8')).split('\n');
  classroom=await chromium.connectOverCDP(`http://127.0.0.1:${backgroundPort.trim()}`);
  const browserCDP=await classroom.newBrowserCDPSession();
  const backgroundPid=(await browserCDP.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;
  await browserCDP.detach();
  const visible=await application.evaluate(({app},pid)=>{
    const path=process.getBuiltinModule('node:path'), cp=process.getBuiltinModule('node:child_process');
    const helper=path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'),'dist-electron',process.platform==='win32'?'attendance-native.exe':'attendance-native');
    return JSON.parse(cp.execFileSync(helper,['visible-windows',String(pid)],{windowsHide:true,encoding:'utf8'})).count;
  },backgroundPid);
  assert.equal(visible,0);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  mock.control({newQuestion:'single'});
  const until=async(condition,message)=>{const end=Date.now()+20000;while(Date.now()<end){if(await condition())return;await delay(150);}throw new Error(message);};
  await until(async()=>{
    const state=await window.evaluate(()=>window.attendance.getState());
    return state.session.handled['demo-session:q1']==='confirmed';
  },'hidden App background monitoring did not confirm the answer');
  assert.equal(mock.state.submissions.length,1);
  const trayState=await application.evaluate(()=>({labels:globalThis.__attendanceTrayLabels,tooltip:globalThis.__attendanceTrayTooltip}));
  assert.ok(trayState.labels.includes('后台模式'));
  assert.ok(trayState.labels.some(label=>label.includes('模拟课堂 · 自动 A')&&label.includes('监控正常')));
  assert.ok(trayState.labels.includes('查看课堂')&&trayState.labels.includes('结束上课'));
  assert.ok(trayState.tooltip.includes('后台模式'));
  mock.control({newQuestion:'other'});
  await until(async()=>(await window.evaluate(()=>window.attendance.getState())).session.status==='needs-answer','headless manual question did not produce an actionable state');
  assert.equal(mock.state.submissions.length,1);
  const beforeHuman=await window.evaluate(()=>window.attendance.getState());
  // Inject the click on the real classroom Notification instance. This checks
  // its handler and route; it does not claim that a human saw/clicked a toast.
  await application.evaluate(()=>{if(!globalThis.__attendanceManualReminder)throw new Error('manual reminder missing');globalThis.__attendanceManualReminder.emit('click');});
  await until(async()=>{const state=await window.evaluate(()=>window.attendance.getState());return state.browserMode==='visible'&&state.browserConnected&&state.session.status==='needs-answer';},'notification did not open the correct visible classroom');
  const [manualPort]=(await readFile(join(data,'chrome-profile','DevToolsActivePort'),'utf8')).split('\n');
  classroom=await chromium.connectOverCDP(`http://127.0.0.1:${manualPort.trim()}`);
  const manualPage=classroom.contexts()[0].pages().find(page=>page.url().startsWith(mock.origin));
  assert.ok(manualPage.url().includes('/class/demo'));
  await manualPage.locator('#short-answer').fill('synthetic manual answer');
  const blocked=await window.evaluate(async()=>{try{await window.attendance.returnToBackground();return '';}catch(error){return error.message;}});
  assert.match(blocked,/尚未收到答案确认/);
  assert.equal(await manualPage.locator('#short-answer').inputValue(),'synthetic manual answer');
  const visibleTray=await application.evaluate(()=>globalThis.__attendanceTrayLabels);
  assert.ok(visibleTray.includes('返回后台'));
  await application.evaluate(()=>globalThis.__attendanceReturnBackground.click());
  await until(async()=>await application.evaluate(()=>!!globalThis.__attendanceBlockedReturnReminder),'tray return failure did not give an actionable reminder');
  assert.match(await application.evaluate(()=>globalThis.__attendanceBlockedReturnReminder.body),/尚未收到答案确认/);
  assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  assert.equal(await manualPage.locator('#short-answer').inputValue(),'synthetic manual answer');
  await manualPage.getByRole('button',{name:'Send',exact:true}).click();
  await until(async()=>(await window.evaluate(()=>window.attendance.getState())).session.handled['demo-session:q2']==='confirmed','manual receipt not recorded');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
  await window.getByRole('button',{name:'返回后台',exact:true}).click();
  await until(async()=>{const state=await window.evaluate(()=>window.attendance.getState());return state.browserMode==='background'&&state.browserConnected&&state.session.status==='monitoring';},'return to background did not resume monitoring');
  const afterHuman=await window.evaluate(()=>window.attendance.getState());
  assert.equal(afterHuman.session.id,beforeHuman.session.id);assert.equal(afterHuman.session.endsAt,beforeHuman.session.endsAt);
  assert.equal(afterHuman.session.handled['demo-session:q1'],'confirmed');assert.equal(afterHuman.session.handled['demo-session:q2'],'confirmed');
  assert.equal(mock.state.submissions.length,2);
  const [returnedPort]=(await readFile(join(data,'chrome-profile','DevToolsActivePort'),'utf8')).split('\n');
  classroom=await chromium.connectOverCDP(`http://127.0.0.1:${returnedPort.trim()}`);
  assert.ok(!(await application.evaluate(()=>globalThis.__attendanceTrayLabels)).includes('返回后台'));
  await window.evaluate(()=>window.attendance.stop());
  await window.getByRole('button',{name:'连接与提醒',exact:true}).click();
  await window.getByRole('button',{name:'显示课堂窗口',exact:true}).click();
  assert.equal((await window.evaluate(()=>window.attendance.getState())).settings.browserMode,'visible');
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
  const checks = ['course list', 'course persistence and duplicate protection', 'extension and persisted summary', 'settings', 'packaged Chrome launch and native helper', 'mock attendance', 'persisted background preference and no visible Chrome window', 'hidden App continues headless answer monitoring and manual-question state', 'classroom Notification click handler (injected event) opens correct visible course', 'manual draft protection and receipt-confirmed return to background retain session and deadline without duplicate answers', 'actual tray menu labels and tooltip (method instrumentation)', syntheticCipher ? 'synthetic encrypted session round trip (OS storage not verified)' : 'OS-encrypted session round trip'];
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
    for (let i = 0; i < 50 && classroom?.isConnected(); i++) await delay(100);
    assert.ok(!classroom?.isConnected(), 'quitting the packaged app must also close its dedicated Chrome');
  }
  finally {
    if (isRunning()) process.kill(electronPid, 'SIGKILL');
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
