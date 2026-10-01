import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createMockClassroom } from './mock-classroom.mjs';

await mkdir('.test-artifacts/phase3', { recursive: true });
for (const name of ['browser', 'watchdog']) await build({ entryPoints: [`src/main/${name}.ts`], outfile: `.test-artifacts/phase3/runtime-${name}.mjs`, format: 'esm', bundle: true, platform: 'node', external: ['playwright-core'] });
const { ChromeClassroom } = await import(pathToFileURL(resolve('.test-artifacts/phase3/runtime-browser.mjs')));
const { Watchdog } = await import(pathToFileURL(resolve('.test-artifacts/phase3/runtime-watchdog.mjs')));
const mock = await createMockClassroom(), directory = await mkdtemp(join(tmpdir(), 'attendance-background-runtime-'));
const key = randomBytes(32);
let encryptionAvailable = true, preferred = 'background', clock = Date.now();
const cipher = {
  isEncryptionAvailable: () => encryptionAvailable,
  encryptString(value) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([c.update(value, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), bytes]); },
  decryptString(value) { const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); d.setAuthTag(value.subarray(12, 28)); return Buffer.concat([d.update(value.subarray(28)), d.final()]).toString(); },
};
const helper = resolve(`dist-electron/attendance-native${process.platform === 'win32' ? '.exe' : ''}`), exec = promisify(execFile);
const native = async (...args) => JSON.parse((await exec(helper, args, { windowsHide: true })).stdout);
const notifications = [], logs = [], checks = [];
const browser = new ChromeClassroom(directory, mock.origin, cipher, () => {}, message => logs.push(message), helper, () => preferred);
const watchdog = new Watchdog(browser, { changed: () => {}, log: (_level, message) => logs.push(message), notify: (...args) => notifications.push(args), clearNotifications: () => {}, keepAwake: () => {} }, () => clock);
const course = { id:'11111111-1111-4111-8111-111111111111', remoteId:'demo', name:'Background runtime', url:`${mock.origin}/#/course/demo/overview`, latitude:0, longitude:0, accuracy:10, durationMinutes:5, mode:'auto-a' };
async function until(condition, message) { const end = Date.now()+12000; while(Date.now()<end) {if(await condition())return;await delay(100);} throw new Error(message); }
async function pidOf() { const cdp=await browser.browser.newBrowserCDPSession(); try{return (await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;}finally{await cdp.detach();} }
try {
  await browser.checkConnection();
  await browser.page.goto(`${mock.origin}/#/courses`);
  await browser.page.locator('#sign-in-button').click();await browser.page.locator('.course-title').waitFor();
  await browser.capture();
  const visiblePid=await pidOf();
  // An unavailable cipher must keep the currently usable login window intact.
  await browser.page.evaluate(()=>sessionStorage.setItem('refresh_token','synthetic-refreshed-token'));
  encryptionAvailable=false;
  await assert.rejects(browser.setMode('background'),/安全存储/);
  assert.equal(browser.mode,'visible');assert.equal(await pidOf(),visiblePid);
  encryptionAvailable=true;
  checks.push('failed session encryption leaves the current visible login usable');
  await watchdog.start(course);
  assert.equal(browser.mode,'background');
  const backgroundPid=await pidOf();
  assert.notEqual(backgroundPid,visiblePid);
  assert.equal((await native('visible-windows',String(backgroundPid))).count,0);
  assert.equal(await browser.page.evaluate(()=>sessionStorage.getItem('refresh_token')),'synthetic-refreshed-token');
  checks.push('starting a configured background session uses real Headless Chrome and restores login');
  const focused=(await native('frontmost')).pid;
  mock.control({open:true});await until(async()=>(await browser.read()).state==='joinable','join missing');
  await watchdog.tick();await until(()=>mock.state.joined,'background join failed');await watchdog.tick();
  assert.equal(watchdog.session.attendance,'confirmed');
  mock.control({newQuestion:'single'});await until(async()=>!!(await browser.read()).question,'question missing');
  await watchdog.tick();await until(()=>mock.state.submissions.length===1,'background answer missing');await watchdog.tick();
  assert.equal(watchdog.session.handled['demo-session:q1'],'confirmed');
  await watchdog.tick();assert.equal(mock.state.submissions.length,1);
  assert.equal((await native('frontmost')).pid,focused);
  checks.push('headless attendance and one answer are confirmed without stealing focus or repeating submission');
  preferred='visible';await watchdog.tick();assert.equal(browser.mode,'background');
  const id=watchdog.session.id, endsAt=watchdog.session.endsAt;
  mock.control({newQuestion:'other'});await until(async()=>(await browser.read()).question?.kind==='other','manual question missing');
  await watchdog.tick();assert.equal(watchdog.session.status,'needs-answer');assert.ok(notifications.length);
  await watchdog.transition(signal=>browser.show(signal));
  assert.equal(browser.mode,'visible');assert.equal(watchdog.session.id,id);assert.equal(watchdog.session.endsAt,endsAt);
  assert.equal(mock.state.submissions.length,1);
  checks.push('preference changes wait for the next session; explicit view opens the current classroom without extending or resubmitting');
  await watchdog.stop();await watchdog.start(course);assert.equal(browser.mode,'visible');
  preferred='background';await watchdog.stop();await watchdog.start(course);assert.equal(browser.mode,'background');
  checks.push('the saved preference takes effect on subsequent sessions in either direction');
  clock=watchdog.session.endsAt+1;await watchdog.tick();
  assert.equal(watchdog.session.status,'completed');assert.equal(watchdog.session.summary.reason,'expired');
  assert.equal(await browser.page.evaluate(()=>window.__attendanceDeadline),0);
  mock.control({newQuestion:'single'});await until(async()=>(await browser.read()).question?.key.endsWith('q3'),'post-expiry question missing');
  await browser.answerA((await browser.read()).question,new AbortController().signal);
  assert.equal(mock.state.submissions.length,1);
  checks.push('controlled-clock expiry disarms the headless page and blocks subsequent automatic answers');
  await writeFile('.test-artifacts/phase3/runtime-report.json',JSON.stringify({platform:process.platform,passed:checks,logs},null,2));
  console.log(JSON.stringify({platform:process.platform,passed:checks},null,2));
}finally{await watchdog.stop();await browser.dispose();await mock.close();await rm(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
