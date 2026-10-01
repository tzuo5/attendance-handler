import assert from 'node:assert/strict';
import { _electron as electron, chromium } from 'playwright-core';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createMockClassroom } from './mock-classroom.mjs';

await mkdir('.test-artifacts/phase3',{recursive:true});
const mock=await createMockClassroom(), data=await mkdtemp(join(tmpdir(),'attendance-recovery-'));
const executable=resolve(process.env.ATTENDANCE_TEST_APP || (process.platform==='win32'?'release-public/win-unpacked/Attendance Handler.exe':'release/mac-arm64/Attendance Handler.app/Contents/MacOS/Attendance Handler'));
const synthetic=process.env.ATTENDANCE_UI_CIPHER==='synthetic', key=randomBytes(32).toString('hex');
let application, window, classroom, electronPid;
const chromePids=[], checks=[];
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){if(error.code!=='ESRCH')throw error;return false;}};
async function until(fn,message){const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await delay(100);}throw new Error(message);}
async function boot(){
  application=await electron.launch({executablePath:executable,env:{...process.env,ATTENDANCE_DEMO:'1',ATTENDANCE_ORIGIN:mock.origin,ATTENDANCE_DATA_DIR:data}});
  electronPid=await application.evaluate(()=>process.pid);window=await application.firstWindow();
  if(synthetic)await application.evaluate(({safeStorage},hex)=>{
    const {randomBytes,createCipheriv,createDecipheriv}=process.getBuiltinModule('node:crypto'),key=Buffer.from(hex,'hex');
    safeStorage.isEncryptionAvailable=()=>true;
    safeStorage.encryptString=value=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]);};
    safeStorage.decryptString=value=>{const d=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));d.setAuthTag(value.subarray(12,28));return Buffer.concat([d.update(value.subarray(28)),d.final()]).toString();};
  },key);
  await window.getByRole('heading',{name:'我的课程',exact:true}).waitFor();
}
const state=()=>window.evaluate(()=>window.attendance.getState());
async function connect(){
  const [port]=(await readFile(join(data,'chrome-profile','DevToolsActivePort'),'utf8')).split('\n');
  classroom=await chromium.connectOverCDP(`http://127.0.0.1:${port.trim()}`);
  const cdp=await classroom.newBrowserCDPSession();
  try{const pid=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;chromePids.push(pid);return pid;}finally{await cdp.detach();}
}
async function crashApp(){process.kill(electronPid,'SIGKILL');await until(()=>!alive(electronPid),'crashed App PID did not exit');}
async function quit(){await application.evaluate(({app})=>setTimeout(()=>app.quit(),0));await until(()=>!alive(electronPid),'App did not quit');}
try{
  await boot();await window.evaluate(()=>window.attendance.login());await connect();
  const page=classroom.contexts()[0].pages().find(p=>p.url().startsWith(mock.origin));
  await page.locator('#sign-in-button').click();await page.locator('.course-title').waitFor();
  await window.evaluate(async()=>{await window.attendance.saveSettings({browserMode:'background'});const s=await window.attendance.getState();await window.attendance.start(s.courses[0].id);});
  mock.control({open:true});await until(async()=>(await state()).session.attendance==='confirmed','attendance missing');
  mock.control({newQuestion:'single'});await until(async()=>(await state()).session.handled['demo-session:q1']==='confirmed','initial receipt missing');
  const original=await state();const firstPid=await connect();
  await crashApp();assert.ok(alive(firstPid),'fixture must leave Chrome alive after an App crash');
  await boot();const interrupted=await state();
  assert.equal(interrupted.session.status,'interrupted');assert.equal(interrupted.session.id,original.session.id);assert.equal(interrupted.session.endsAt,original.session.endsAt);
  assert.equal(mock.state.submissions.length,1);await connect();
  const pausedPage=classroom.contexts()[0].pages().find(p=>p.url().startsWith(mock.origin));
  assert.equal(await pausedPage.evaluate(()=>window.__attendanceDeadline),0);
  await window.screenshot({path:'.test-artifacts/phase3/recovery-app.png'});
  checks.push('real App crash retains an explicit interrupted recovery choice, original deadline and handled receipt; existing browser gates are paused');
  await window.getByRole('button',{name:'恢复上次课堂',exact:true}).click();
  await until(async()=>{const s=await state();return s.session.status==='monitoring'&&s.browserConnected;},'interrupted classroom did not recover');
  assert.equal((await state()).session.endsAt,original.session.endsAt);assert.equal(mock.state.submissions.length,1);
  checks.push('explicit App recovery rechecks the real page without resubmitting or creating a new duration');
  const oldPort=await readFile(join(data,'chrome-profile','DevToolsActivePort'),'utf8'), crashedChrome=await connect();
  process.kill(crashedChrome,'SIGKILL');await until(()=>!alive(crashedChrome),'crashed Chrome PID remains');
  await until(async()=>{const s=await state();return s.browserConnected&&s.session.status==='monitoring'&&(await readFile(join(data,'chrome-profile','DevToolsActivePort'),'utf8'))!==oldPort;},'background Chrome crash did not reconnect');
  const restored=await state();assert.equal(restored.session.id,original.session.id);assert.equal(restored.session.endsAt,original.session.endsAt);assert.equal(mock.state.submissions.length,1);
  checks.push('actual background Chrome crash reconnects within the same session and preserves the confirmed answer');
  const lastPid=await connect();await crashApp();
  const persisted=JSON.parse(await readFile(join(data,'state.json'),'utf8'));persisted.session.endsAt=Date.now()-1;
  await writeFile(join(data,'state.json'),JSON.stringify(persisted));
  await boot();const expired=await state();assert.equal(expired.session.status,'completed');assert.equal(expired.session.summary.reason,'expired');
  assert.equal(expired.browserConnected,false);assert.equal(await window.getByRole('button',{name:'恢复上次课堂',exact:true}).count(),0);
  await until(()=>!alive(lastPid),'expired interrupted startup did not close leftover dedicated Chrome');
  assert.equal(mock.state.submissions.length,1);
  checks.push('expired App interruption stays ended, closes the leftover dedicated process and never restarts monitoring');
  await quit();assert.ok(chromePids.every(pid=>!alive(pid)),'dedicated browser process remained after recovery tests');
  checks.push('all recorded dedicated browser PIDs and the final App PID exit');
  await writeFile('.test-artifacts/phase3/recovery-report.json',JSON.stringify({platform:process.platform,checks,encryption:synthetic?'synthetic (OS storage not verified)':'OS storage',data},null,2));
  console.log(JSON.stringify({platform:process.platform,checks,encryption:synthetic?'synthetic (OS storage not verified)':'OS storage'},null,2));
}finally{
  if(electronPid&&alive(electronPid))await quit().catch(()=>process.kill(electronPid,'SIGKILL'));
  if(classroom?.isConnected()){const cdp=await classroom.newBrowserCDPSession();await cdp.send('Browser.close').catch(()=>{});await classroom.close();}
  await mock.close();
}
